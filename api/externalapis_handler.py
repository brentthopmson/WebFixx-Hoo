import requests
from flask import jsonify
import logging

class ExternalApisHandler:
    def __init__(self):
        self.APPSCRIPT_URL = "https://script.google.com/macros/s/AKfycbzpGDrsMrVbWe4xjt39a0AhJWPTmdqLvfSia1-gkSfNK5aTIQ95m83Q-kvIXukn_JxLXA/exec"
        self.headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
        }
        logging.basicConfig(level=logging.DEBUG)
        self.logger = logging.getLogger(__name__)

    def handle_login(self, login_data):
        """Handle login request"""
        try:
            self.logger.debug(f"Login attempt with data: {login_data}")
            payload = {
                'action': 'login',
                **login_data
            }
            self.logger.debug(f"Sending payload to AppScript: {payload}")
            response = requests.post(self.APPSCRIPT_URL, data=payload, headers=self.headers)
            self.logger.debug(f"Raw response from AppScript: {response.text}")
            
            # Check if response is empty
            if not response.text:
                return {'error': 'Empty response from server'}
                
            # Try to parse JSON response
            try:
                return response.json()
            except ValueError as e:
                self.logger.error(f"JSON parsing error: {str(e)}")
                self.logger.error(f"Response content: {response.text}")
                return {'error': f'Invalid JSON response: {str(e)}'}
                
        except Exception as e:
            self.logger.error(f"Login error: {str(e)}")
            return {'error': str(e)}

    def handle_register(self, registration_data):
        """Handle registration request"""
        try:
            payload = {
                'action': 'register',
                **registration_data
            }
            response = requests.post(self.APPSCRIPT_URL, data=payload, headers=self.headers)
            return response.json()
        except Exception as e:
            return {'error': str(e)}

    def handle_reset_password(self, reset_data):
        """Handle password reset request"""
        try:
            payload = {
                'action': 'resetPassword',
                **reset_data
            }
            response = requests.post(self.APPSCRIPT_URL, data=payload, headers=self.headers)
            return response.json()
        except Exception as e:
            return {'error': str(e)}

    def handle_backend_multi_function(self, function_data):
        """Handle backend multi-function request"""
        try:
            payload = {
                'action': 'backendMultiFunction',
                **function_data
            }
            response = requests.post(self.APPSCRIPT_URL, data=payload, headers=self.headers)
            return response.json()
        except Exception as e:
            return {'error': str(e)}