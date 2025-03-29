import requests
from flask import jsonify

class ExternalApisHandler:
    def __init__(self):
        self.APPSCRIPT_URL = "https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec"
        self.headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
        }

    def handle_login(self, login_data):
        """Handle login request"""
        try:
            payload = {
                'action': 'login',
                **login_data
            }
            response = requests.post(self.APPSCRIPT_URL, data=payload, headers=self.headers)
            return response.json()
        except Exception as e:
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