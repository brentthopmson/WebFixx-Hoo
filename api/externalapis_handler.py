import requests
from flask import jsonify
import logging
import os
import time
import base64
import threading
from dotenv import load_dotenv
from .file_validators import validate_upload_campaign_csv
from .campaign_validators import validate_campaign_metadata

load_dotenv()

_TOKEN_CACHE = {}
_TOKEN_CACHE_TTL = int(os.getenv('TOKEN_CACHE_TTL', '60'))

# Backend function names that mutate data. After a successful one that does not
# return fresh appData, the per-user AppData cache is invalidated so reads refresh.
_WRITE_FUNCTIONS = {
    'updateSetting',
    'updateUserPreferences',
    'changePassword',
    'generateApiKey',
    'destroyAccount',
    'changePlan',
    'toggleTwoFactorAuth',
    'toggleAutoVerify',
    'visitNotification',
    'verifySession',
    'createProjectLink',
    'updateProjectTemplateVariables',
    'updateProjectNotifications',
    'acquireDomain',
    'acquireRedirect',
    'renewProject',
    'deleteProject',
    'createNewCampaign',
    'updateCampaign',
    'deleteCampaign',
    'validateCampaignEmails',
    'enrichCampaignLeads',
    'personalizeCampaignEmails',
    'executeCampaign',
    'pauseCampaign',
    'resumeCampaign',
    'createRedirect',
    'renewRedirect',
    'addRedirectEndPages',
    'updateRedirectEndPages',
    'initializePayment',
    'buyUsAdrink',
    'saveMemo',
    'runSmartExtract',
    'notifyFormSubmission',
    'updateProcess',
    'poolingOperator',
}

def _prune_token_cache():
    """Remove expired entries from the in-process token cache."""
    now = time.time()
    expired = [k for k, (expires_at, _) in _TOKEN_CACHE.items() if now >= expires_at]
    for k in expired:
        _TOKEN_CACHE.pop(k, None)

# ---------------------------------------------------------------------------
# Per-user, table-keyed AppData cache (in-memory).
# Getters serve from here; writes hit Apps Script on demand then re-cache.
# ---------------------------------------------------------------------------
_APP_CACHE_TTL = int(os.getenv('APP_CACHE_TTL', '120'))
_APP_CACHE_MAX = int(os.getenv('APP_CACHE_MAX', '2000'))
_APP_DATA_CACHE = {}

# In-flight appData reads per user. When two identical getAppDataLite/updateAppData
# calls arrive together, the second waits on the first's event instead of issuing a
# second (huge) Apps Script round-trip. Cleared by _release_inflight().
_INFLIGHT_READS = {}


def _release_inflight(user_id, event, owned):
    if not owned or event is None:
        return
    event.set()
    if _INFLIGHT_READS.get(user_id) is event:
        _INFLIGHT_READS.pop(user_id, None)

def _prune_app_cache():
    """Remove expired entries and cap the cache size."""
    now = time.time()
    expired = [k for k, (expires_at, _) in _APP_DATA_CACHE.items() if now >= expires_at]
    for k in expired:
        _APP_DATA_CACHE.pop(k, None)
    if len(_APP_DATA_CACHE) > _APP_CACHE_MAX:
        for k in list(_APP_DATA_CACHE)[: len(_APP_DATA_CACHE) - _APP_CACHE_MAX]:
            _APP_DATA_CACHE.pop(k, None)

def _app_key(user_id, table):
    return f"app:{user_id}:{table}"

def _get_app_table(user_id, table):
    _prune_app_cache()
    entry = _APP_DATA_CACHE.get(_app_key(user_id, table))
    if entry and entry[0] >= time.time():
        return entry[1]
    return None

def _set_app_table(user_id, table, value):
    _APP_DATA_CACHE[_app_key(user_id, table)] = (time.time() + _APP_CACHE_TTL, value)

def _invalidate_user(user_id):
    if not user_id:
        return
    _prune_app_cache()
    for k in [k for k in list(_APP_DATA_CACHE) if k.startswith(f"app:{user_id}:")]:
        _APP_DATA_CACHE.pop(k, None)

def _extract_user_id(token):
    """Decode userId from the app token without hitting Apps Script.
    Token = base64( userId|role|ts|rand . <hmac> )."""
    if not token:
        return None
    try:
        padded = token + "=" * (-len(token) % 4)
        decoded = base64.b64decode(padded).decode('utf-8', 'ignore')
        data_part = decoded.split('.')[0]
        parts = data_part.split('|')
        return parts[0] if parts and parts[0] else None
    except Exception:
        return None

_APP_USER_KEY = "__user"
_APP_META_KEY = "__meta"

def _set_app_data(user_id, user, needs_verification, app_data):
    """Cache a user's whole appData bundle as individual per-table entries."""
    if not user_id or not app_data:
        return
    if user:
        _set_app_table(user_id, _APP_USER_KEY, user)
    _set_app_table(user_id, _APP_META_KEY, {"needsVerification": bool(needs_verification)})
    for table, value in app_data.items():
        _set_app_table(user_id, table, value)

def _cached_appdata_ready(user_id):
    return bool(_get_app_table(user_id, _APP_USER_KEY) is not None and
                _get_app_table(user_id, _APP_META_KEY) is not None)

def _build_cached_appdata(user_id):
    """Rebuild the exact updateAppData response shape from the per-user cache."""
    _prune_app_cache()
    prefix = f"app:{user_id}:"
    app_data = {}
    for k in list(_APP_DATA_CACHE):
        if not k.startswith(prefix):
            continue
        table = k[len(prefix):]
        if table in (_APP_USER_KEY, _APP_META_KEY):
            continue
        entry = _APP_DATA_CACHE[k]
        if entry[0] >= time.time():
            app_data[table] = entry[1]
    user = _get_app_table(user_id, _APP_USER_KEY)
    meta = _get_app_table(user_id, _APP_META_KEY) or {}
    return {
        "success": True,
        "user": user,
        "appData": app_data,
        "needsVerification": bool(meta.get("needsVerification", False)),
        "data": None,
        "cached": True,
    }


class ExternalApisHandler:
    def __init__(self):
        self.APPSCRIPT_URL = os.getenv('APPSCRIPT_URL')
        self.timeout = int(os.getenv('APPSCRIPT_TIMEOUT', '180'))
        self.headers = {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
        logging.basicConfig(level=logging.DEBUG)
        self.logger = logging.getLogger(__name__)
        if self.APPSCRIPT_URL:
            from urllib.parse import urlparse
            self.logger.info(f"[AppScript] configured URL host: {urlparse(self.APPSCRIPT_URL).hostname} (timeout={self.timeout}s)")

    def _post_appscript(self, payload):
        """POST to Apps Script with latency/status logging. Returns the response object."""
        start = time.time()
        try:
            response = requests.post(self.APPSCRIPT_URL, data=payload, headers=self.headers, timeout=self.timeout)
            latency_ms = int((time.time() - start) * 1000)
            self.logger.info(
                f"[AppScript] action={payload.get('action')} fn={payload.get('functionName', 'N/A')} "
                f"-> {response.status_code} in {latency_ms}ms len={len(response.text)}"
            )
            return response
        except Exception as e:
            latency_ms = int((time.time() - start) * 1000)
            self.logger.error(
                f"[AppScript] action={payload.get('action')} fn={payload.get('functionName', 'N/A')} "
                f"-> EXC {str(e)} in {latency_ms}ms"
            )
            raise

    def _safe_json(self, response):
        """Parse JSON response safely, handling empty bodies and non-200 status codes."""
        if response.status_code != 200:
            self.logger.warning(f"Non-200 response from AppScript: {response.status_code}")
            return {'error': f'Server returned status {response.status_code}', 'success': False}
        if not response.text or not response.text.strip():
            self.logger.warning("Empty response body from AppScript")
            return {'error': 'Empty response from server', 'success': False}
        try:
            return response.json()
        except ValueError as e:
            self.logger.error(f"JSON parsing error: {str(e)} | Body: {response.text[:500]}")
            return {'error': f'Invalid JSON response: {str(e)}', 'success': False}

    def notify_form_submission(self, form_data):
        """Handle form submission notification"""
        try:
            payload = {
                'action': 'notifyFormSubmission',
                'key': os.getenv('SCRIPT_KEY'),
                **form_data
            }
            response = self._post_appscript(payload)
            return self._safe_json(response)
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
            response = self._post_appscript(payload)
            return self._safe_json(response)
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
            response = self._post_appscript(payload)
            return self._safe_json(response)
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
            response = self._post_appscript(payload)
            self.logger.debug(f"Raw response from AppScript: {response.text}")
            return self._safe_json(response)
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
            response = self._post_appscript(payload)
            return self._safe_json(response)
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
            response = self._post_appscript(payload)
            return self._safe_json(response)
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
            response = self._post_appscript(payload)
            self.logger.debug(f"Verification response: {response.text}")
            return self._safe_json(response)
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
            response = self._post_appscript(payload)
            self.logger.debug(f"Password update response: {response.text}")
            return self._safe_json(response)
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
            validate_response = self._post_appscript(validate_payload)
            validate_result = self._safe_json(validate_response)

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
            session_response = self._post_appscript(session_payload)
            session_result = self._safe_json(session_response)

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

            # Resolve requesting user from the token (no Apps Script round-trip needed)
            token = function_data.get('token', '')
            req_uid = _extract_user_id(token)
            force = str(function_data.get('forceRefresh', '')).lower() in ('true', '1', 'yes')
            is_read = function_name in ('updateAppData', 'getAppDataLite')
            
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

            # Layer 1: cache validateUserToken to avoid hammering Apps Script
            if function_name == 'validateUserToken':
                token = function_data.get('token', '')
                if token:
                    _prune_token_cache()
                    cached = _TOKEN_CACHE.get(token)
                    if cached:
                        expires_at, result = cached
                        if time.time() < expires_at:
                            self.logger.info(f"[Backend] CACHE HIT for validateUserToken")
                            return result
                        _TOKEN_CACHE.pop(token, None)

            # Layer 2 (read path): serve appData from the per-user cache unless
            # forced (manual "Get Update") or the cache is cold. Concurrent reads
            # for the same user are coalesced into a single Apps Script call.
            coalesced_read = is_read and bool(req_uid)
            inflight_event = None
            owns_inflight = False
            if coalesced_read:
                if not force and _cached_appdata_ready(req_uid):
                    self.logger.info(f"[Backend] AppData CACHE HIT for user {req_uid} (fn={function_name})")
                    return _build_cached_appdata(req_uid)
                existing = _INFLIGHT_READS.get(req_uid)
                if existing is not None:
                    self.logger.info(f"[Backend] Coalescing read for user {req_uid} (fn={function_name})")
                    existing.wait(timeout=self.timeout + 30)
                    if _cached_appdata_ready(req_uid):
                        return _build_cached_appdata(req_uid)
                inflight_event = threading.Event()
                _INFLIGHT_READS[req_uid] = inflight_event
                owns_inflight = True

            payload = {
                'action': 'backendFunction',
                'key': os.getenv('SCRIPT_KEY'),
                **function_data
            }
            self.logger.info(f"[Backend] Dispatching to AppScript: {function_name}")
            last_error = None
            for attempt in range(2):
                try:
                    response = self._post_appscript(payload)
                    status = response.status_code
                    result = self._safe_json(response)
                    # Apps Script returns the bundle under 'data'; the frontend
                    # reads 'appData'. Mirror so both work and the cache fills.
                    if is_read and isinstance(result, dict) and result.get('success'):
                        if 'appData' not in result and 'data' in result:
                            result['appData'] = result['data']
                    result_user_id = req_uid or ((result.get('user') or {}).get('userId'))
                    if result.get('success') is False:
                        # Transient statuses (404/429/5xx) under throttling: retry once.
                        # Empty body / invalid JSON / real business errors: do NOT retry.
                        if status in (404, 429) or status >= 500:
                            if attempt == 0:
                                self.logger.warning(f"[Backend] Transient status {status} for {function_name}. Retrying once...")
                                continue
                        self.logger.warning(f"[Backend] AppScript returned failure for {function_name}: {result.get('error')}")
                        # A failed write may have partially mutated data — drop stale cache.
                        _invalidate_user(result_user_id)
                        _release_inflight(req_uid, inflight_event, owns_inflight)
                        return result
                    self.logger.info(f"[Backend] AppScript response: success={result.get('success', 'unknown')} | error={result.get('error', 'none')}")
                    if function_name == 'updateSetting':
                        self.logger.info(
                            f"[Backend] updateSetting result for user={result_user_id}: "
                            f"success={result.get('success')} | error={result.get('error')} | "
                            f"rowNumber={result.get('rowNumber')} | key={function_data.get('settingsKey')}"
                        )
                    if function_name == 'validateUserToken' and token and result.get('success'):
                        _TOKEN_CACHE[token] = (time.time() + _TOKEN_CACHE_TTL, result)
                    # Write/read succeeded: refresh-and-recache that user's tables
                    # so the next getter reads fresh data from cache.
                    if result.get('success') and result.get('appData') is not None and result_user_id:
                        _set_app_data(result_user_id, result.get('user'), result.get('needsVerification'), result.get('appData'))
                        self.logger.info(f"[Backend] AppData cached for user {result_user_id} after {function_name}")
                    # Mutations that do NOT return fresh appData (e.g. updateSetting)
                    # leave the per-user cache stale — drop it so the next read refetches
                    # from Apps Script instead of serving out-of-date rows for the TTL.
                    elif result.get('success') and result_user_id and function_name in _WRITE_FUNCTIONS:
                        _invalidate_user(result_user_id)
                        self.logger.info(f"[Backend] Invalidated cache for user {result_user_id} after write {function_name}")
                    _release_inflight(req_uid, inflight_event, owns_inflight)
                    return result
                except requests.exceptions.ConnectionError as e:
                    last_error = e
                    if attempt == 0:
                        self.logger.warning(f"[Backend] Attempt {attempt+1} failed for {function_name}: {str(e)}. Retrying once...")
                except Exception as e:
                    last_error = e
                    self.logger.error(f"[Backend] Attempt {attempt+1} failed for {function_name}: {str(e)}")
                    break
            _release_inflight(req_uid, inflight_event, owns_inflight)
            return {'error': str(last_error), 'success': False}
        except Exception as e:
            self.logger.error(f"[Backend] Exception in handle_backend_multi_function: {str(e)}")
            return {'error': str(e), 'success': False}
        