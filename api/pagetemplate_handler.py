import requests
import json
import re
import time
from flask import render_template_string, request
from dotenv import load_dotenv
import os
import logging

try:
    from .clientip import client_ip
except ImportError:
    from clientip import client_ip

logger = logging.getLogger(__name__)

load_dotenv()

class PageTemplateHandler:
    def __init__(self):
        self.APPSCRIPT_URL = os.getenv('APPSCRIPT_URL')

    def _safe_json(self, response):
        """Parse AppScript JSON safely. Returns None for transient/non-JSON responses,
        else the parsed dict. Business errors (success=false) come back as dicts."""
        if response.status_code != 200:
            logger.warning("verify_page_visit non-200 status=%s body=%s", response.status_code, response.text[:200])
            return None
        if not response.text or not response.text.strip():
            logger.warning("verify_page_visit empty body from AppScript")
            return None
        try:
            data = response.json()
        except ValueError as e:
            logger.error("verify_page_visit invalid JSON: %s | body: %s", str(e), response.text[:500])
            return None
        if not isinstance(data, dict):
            logger.warning("verify_page_visit non-object JSON from AppScript")
            return None
        return data

    def verify_page_visit(self, complete_url, path):
        headers = {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
        payload = {
            'action': 'verifyPageVisit',
            'completeUrl': complete_url,
            'path': path,
            'key': os.getenv('SCRIPT_KEY'),
            'ipData': client_ip()
        }
        for attempt in range(2):
            try:
                start_time = time.time()
                response = requests.post(self.APPSCRIPT_URL, headers=headers, data=payload)
                elapsed = int((time.time() - start_time) * 1000)
                logger.info("verify_page_visit path=%s status=%s in %dms", path, response.status_code, elapsed)
                data = self._safe_json(response)
                if data is None:
                    logger.warning("verify_page_visit path=%s transient response, retrying (attempt %d)", path, attempt + 1)
                    if attempt == 0:
                        continue
                    return {
                        'success': False,
                        'error': 'Server is temporarily unavailable. Please try again.'
                    }
                if data.get('success'):
                    code_len = len(data.get('templateCode') or '')
                    logger.info("verify_page_visit path=%s SUCCESS templateCodeLen=%s", path, code_len)
                    return {
                        'success': True,
                        'templateCode': data.get('templateCode'),
                        'userId': data.get('userId', ''),
                        'status': data.get('status', 'active')
                    }
                logger.warning("verify_page_visit path=%s FAILED error=%s", path, data.get('error', 'unknown'))
                return {
                    'success': False,
                    'error': data.get('error', 'Invalid response from server')
                }
            except Exception as e:
                logger.error("Exception in verify_page_visit (attempt %d): %s", attempt + 1, str(e))
                if attempt == 0:
                    continue
                return {
                    'success': False,
                    'error': 'Server error while verifying page. Please try again.'
                }
        return {'success': False, 'error': 'Invalid response from server'}

    def handle_page_template(self, path):
        start_time = time.time()
        visitor_ip = client_ip()
        user_agent = request.headers.get('User-Agent', '')
        logger.info("handle_page_template path=%s ip=%s ua=%s", path, visitor_ip, user_agent[:80])

        try:
            complete_url = request.url
            page_data = self.verify_page_visit(complete_url, path)
            
            if not page_data['success']:
                logger.warning("handle_page_template path=%s FAILED verifyPageVisit: %s", path, page_data.get('error'))
                return None, page_data['error']

            template_code = page_data.get('templateCode') or ''
            user_id = str(page_data.get('userId') or '').strip()
            # The engine's verify-login/-lite/-ai routes fail closed (403) when
            # the userId query param is missing — inject the project owner as
            # the first param of any verify-login URL in the template.
            if user_id and user_id != 'N/A' and 'verify-login' in template_code:
                template_code = re.sub(
                    r'(verify-login(?:-lite|-ai)?\?)(?![^"\'\s#]*userId=)',
                    lambda m: m.group(1) + 'userId=' + user_id + '&',
                    template_code,
                )
                logger.info("handle_page_template path=%s injected userId into verify-login URL", path)

            logger.info("handle_page_template path=%s RENDER ok total=%dms", path, int((time.time() - start_time) * 1000))
            return render_template_string(template_code), None
            
        except Exception as e:
            return None, f"Error processing template: {str(e)}"
