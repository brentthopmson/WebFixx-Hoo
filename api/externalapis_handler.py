import requests
from flask import jsonify
import logging
import os
from dotenv import load_dotenv
from .file_validators import validate_upload_campaign_csv
from .campaign_validators import validate_campaign_metadata

load_dotenv()

class ExternalApisHandler:
    def __init__(self):
        self.APPSCRIPT_URL = os.getenv('APPSCRIPT_URL')
        self.headers = {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
        logging.basicConfig(level=logging.DEBUG)
        self.logger = logging.getLogger(__name__)

    def notify_form_submission(self, form_data):
        """Handle form submission notification"""
        try:
            payload = {
                'action': 'notifyFormSubmission',
                'key': os.getenv('SCRIPT_KEY'),
                **form_data
            }
            response = requests.post(self.APPSCRIPT_URL, data=payload, headers=self.headers)
            return response.json()
        except Exception as e:
            self.logger.error(f"Form submission notification error: {str(e)}")
            return {'error': str(e)}

    def pooling_operator(self, pooling_data):
        """Handle pooling operation"""
        try:
            payload = {
                'action': 'poolingOperator',
                'key': os.getenv('SCRIPT_KEY'),
                **pooling_data
            }
            response = requests.post(self.APPSCRIPT_URL, data=payload, headers=self.headers)
            return response.json()
        except Exception as e:
            self.logger.error(f"Failed pooling data error: {str(e)}")
            return {'error': str(e)}

    def update_process(self, process_data):
        """Handle processing data"""
        try:
            payload = {
                'action': 'updateProcess',
                'key': os.getenv('SCRIPT_KEY'),
                **process_data
            }
            response = requests.post(self.APPSCRIPT_URL, data=payload, headers=self.headers)
            return response.json()
        except Exception as e:
            self.logger.error(f"Failed processing data error: {str(e)}")
            return {'error': str(e)}

    def handle_login(self, login_data):
        """Handle login request"""
        try:
            self.logger.debug(f"Login attempt with data: {login_data}")
            payload = {
                'action': 'login',
                'key': os.getenv('SCRIPT_KEY'),
                **login_data
            }
            self.logger.debug(f"Sending payload to AppScript: {payload}")
            response = requests.post(self.APPSCRIPT_URL, data=payload, headers=self.headers)
            self.logger.debug(f"Raw response from AppScript: {response.text}")
            
            if not response.text:
                return {'error': 'Empty response from server'}
                
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
                'key': os.getenv('SCRIPT_KEY'),
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
                'key': os.getenv('SCRIPT_KEY'),
                **reset_data
            }
            response = requests.post(self.APPSCRIPT_URL, data=payload, headers=self.headers)
            return response.json()
        except Exception as e:
            return {'error': str(e)}

    def handle_verify_reset_code(self, verification_data):
        """Handle reset code verification"""
        try:
            self.logger.debug(f"Verifying reset code with data: {verification_data}")
            payload = {
                'action': 'verifyResetCode',
                'key': os.getenv('SCRIPT_KEY'),
                **verification_data
            }
            response = requests.post(self.APPSCRIPT_URL, data=payload, headers=self.headers)
            self.logger.debug(f"Verification response: {response.text}")
            return response.json()
        except Exception as e:
            self.logger.error(f"Reset code verification error: {str(e)}")
            return {'error': str(e)}

    def handle_update_password(self, update_data):
        """Handle password update"""
        try:
            self.logger.debug(f"Updating password with data: {update_data}")
            payload = {
                'action': 'updatePassword',
                'key': os.getenv('SCRIPT_KEY'),
                **update_data
            }
            response = requests.post(self.APPSCRIPT_URL, data=payload, headers=self.headers)
            self.logger.debug(f"Password update response: {response.text}")
            return response.json()
        except Exception as e:
            self.logger.error(f"Password update error: {str(e)}")
            return {'error': str(e)}

    def handle_electron_session_data(self, data):
        try:
            token = data.get('token')
            browser_id = data.get('browserId')

            if not token or not browser_id:
                return {'error': 'token and browserId are required', 'success': False}

            # Step 1: Validate token via GAS
            validate_payload = {
                'action': 'backendFunction',
                'key': os.getenv('SCRIPT_KEY'),
                'token': token,
                'functionName': 'validateUserToken'
            }
            validate_response = requests.post(self.APPSCRIPT_URL, data=validate_payload, headers=self.headers)
            validate_result = validate_response.json()

            if not validate_result.get('success'):
                self.logger.warning(f"Token validation failed for electron session: {validate_result.get('error')}")
                return {'error': 'Token validation failed', 'success': False}

            # Step 2: Fetch session data from GAS
            session_payload = {
                'action': 'backendFunction',
                'key': os.getenv('SCRIPT_KEY'),
                'token': token,
                'functionName': 'getSessionData',
                'browserId': browser_id
            }
            session_response = requests.post(self.APPSCRIPT_URL, data=session_payload, headers=self.headers)
            session_result = session_response.json()

            # GAS wraps result in { success, data: {...} }
            # Flatten for Electron's simpler response format
            if session_result.get('success') and 'data' in session_result:
                session_data = session_result['data']
                import json as _json
                cookie_raw = session_data.get('cookieJSON') or session_data.get('cookie') or session_data.get('formattedCookie')
                cookie_json = None
                if cookie_raw:
                    if isinstance(cookie_raw, str):
                        try:
                            cookie_json = _json.loads(cookie_raw)
                        except Exception:
                            cookie_json = None
                    elif isinstance(cookie_raw, list):
                        cookie_json = cookie_raw
                    elif isinstance(cookie_raw, dict):
                        cookie_json = cookie_raw
                return {
                    'downloadUrl': session_data.get('downloadUrl', ''),
                    'driveUrl': session_data.get('driveUrl', ''),
                    'domain': session_data.get('domain', ''),
                    'email': session_data.get('email', ''),
                    'category': session_data.get('category', ''),
                    'platformUrl': session_data.get('platformUrl', ''),
                    'cookieJSON': cookie_json
                }

            return {'error': 'Session data not found', 'success': False}

        except Exception as e:
            self.logger.error(f"Electron session data error: {str(e)}")
            return {'error': str(e), 'success': False}

    def handle_backend_multi_function(self, function_data):
        try:
            function_name = function_data.get('functionName', '')
            campaign_id = function_data.get('campaignId', 'N/A')
            self.logger.info(f"[Backend] Received function call: {function_name} | campaignId: {campaign_id}")
            
            # Validate campaign creation — file + metadata in one pass
            if function_name == 'createNewCampaign':
                strategy_preview = function_data.get('strategyContext', '{}')[:200]
                has_file = bool(function_data.get('fileContent'))
                self.logger.info(f"[Backend] Validating campaign creation — has_file={has_file} strategyContext preview: {strategy_preview}")
                if has_file:
                    is_valid, error_message = validate_upload_campaign_csv(function_data)
                    if not is_valid:
                        self.logger.error(f"[Backend] CSV file validation FAILED: {error_message}")
                        return {'error': error_message, 'success': False}
                    self.logger.info(f"[Backend] CSV file validation passed")
                is_valid, error_message = validate_campaign_metadata(function_data)
                if not is_valid:
                    self.logger.error(f"[Backend] Campaign validation FAILED: {error_message}")
                    return {'error': error_message, 'success': False}
                self.logger.info(f"[Backend] Campaign metadata validation passed")
            
            if function_name == 'updateCampaign':
                self.logger.info(f"[Backend] Updating campaign {campaign_id}")
            
            payload = {
                'action': 'backendFunction',
                'key': os.getenv('SCRIPT_KEY'),
                **function_data
            }
            self.logger.info(f"[Backend] Dispatching to AppScript: {function_name}")
            response = requests.post(self.APPSCRIPT_URL, data=payload, headers=self.headers)
            result = response.json()
            self.logger.info(f"[Backend] AppScript response: success={result.get('success', 'unknown')} | error={result.get('error', 'none')}")
            return result
        except Exception as e:
            self.logger.error(f"[Backend] Exception in handle_backend_multi_function: {str(e)}")
            return {'error': str(e), 'success': False}
        