"""
Campaign Metadata Validators for Backend (Flask)
Validates campaign structure before storing in Google Sheets
"""

import json
import re
import logging
from typing import Dict, Tuple

logger = logging.getLogger(__name__)

# Allowed values
ALLOWED_CHANNELS = ['email', 'social']
ALLOWED_CAMPAIGN_TYPES = ['general', 'email_logs', 'bank_logs']
ALLOWED_DELIVERY_METHODS = ['smtp', 'wire', 'mixed']


def validate_campaign_name(name: str) -> Tuple[bool, str]:
    """Validate campaign name"""
    if not name or not isinstance(name, str):
        return False, "Campaign name is required"
    
    if len(name.strip()) == 0:
        return False, "Campaign name cannot be empty"
    
    if len(name) > 255:
        return False, f"Campaign name cannot exceed 255 characters (current: {len(name)})"
    
    return True, ""


def validate_campaign_channel(channel: str) -> Tuple[bool, str]:
    """Validate campaign channel"""
    if not channel or not isinstance(channel, str):
        return False, "Campaign channel is required"
    
    if channel.lower() not in ALLOWED_CHANNELS:
        return False, f"Invalid channel '{channel}'. Allowed: {', '.join(ALLOWED_CHANNELS)}"
    
    return True, ""


def validate_campaign_type(campaign_type: str) -> Tuple[bool, str]:
    """Validate campaign type"""
    if not campaign_type or not isinstance(campaign_type, str):
        return False, "Campaign type is required"
    
    if campaign_type.lower() not in ALLOWED_CAMPAIGN_TYPES:
        return False, f"Invalid type '{campaign_type}'. Allowed: {', '.join(ALLOWED_CAMPAIGN_TYPES)}"
    
    return True, ""


def validate_email_subject(subject: str, channel: str) -> Tuple[bool, str]:
    """Validate email subject (required for email campaigns)"""
    if channel.lower() == 'email':
        if not subject or not isinstance(subject, str):
            return False, "Email subject is required for email campaigns"
        
        if len(subject.strip()) == 0:
            return False, "Email subject cannot be empty"
        
        if len(subject) > 500:
            return False, f"Email subject cannot exceed 500 characters (current: {len(subject)})"
    
    return True, ""


def validate_email_body(body: str, channel: str) -> Tuple[bool, str]:
    """Validate email body (required for email campaigns)"""
    if channel.lower() == 'email':
        if not body or not isinstance(body, str):
            return False, "Email body is required for email campaigns"
        
        if len(body.strip()) == 0:
            return False, "Email body cannot be empty"
        
        if len(body) > 50000:
            return False, f"Email body cannot exceed 50000 characters (current: {len(body)})"
    
    return True, ""


def validate_file_url(file_url: str, channel: str) -> Tuple[bool, str]:
    """Validate campaign file URL (required for email campaigns)"""
    if channel.lower() == 'email':
        if not file_url or not isinstance(file_url, str):
            return False, "Contact list file URL is required for email campaigns"
        
        if len(file_url.strip()) == 0:
            return False, "Contact list file URL cannot be empty"
        
        # Validate Google Drive URL format
        if not is_valid_google_drive_url(file_url):
            return False, "Invalid file URL. Must be a valid Google Drive file link"
    
    return True, ""


def is_valid_google_drive_url(url: str) -> bool:
    """Check if URL is valid Google Drive URL"""
    if not isinstance(url, str):
        return False
    
    # Check if it's a Google Drive URL
    if 'drive.google.com' not in url:
        return False
    
    # Extract file ID
    file_id = extract_google_drive_file_id(url)
    return file_id is not None and len(file_id) > 0


def extract_google_drive_file_id(url: str) -> str:
    """Extract Google Drive file ID from URL"""
    try:
        # Pattern: /d/FILE_ID/
        match = re.search(r'/d/([a-zA-Z0-9-_]+)', url)
        return match.group(1) if match else None
    except:
        return None


def validate_delivery_method(method: str) -> Tuple[bool, str]:
    """Validate delivery method"""
    if not method or not isinstance(method, str):
        return False, "Delivery method is required"
    
    if method.lower() not in ALLOWED_DELIVERY_METHODS:
        return False, f"Invalid delivery method '{method}'. Allowed: {', '.join(ALLOWED_DELIVERY_METHODS)}"
    
    return True, ""


def validate_smtp_settings(settings: list, delivery_method: str) -> Tuple[bool, str]:
    """Validate SMTP settings configuration"""
    if delivery_method.lower() in ['smtp', 'mixed']:
        if not settings or not isinstance(settings, list) or len(settings) == 0:
            return False, "At least one SMTP configuration is required for SMTP delivery"
        
        # Validate each SMTP config
        for i, smtp in enumerate(settings):
            if not isinstance(smtp, dict):
                return False, f"SMTP configuration {i + 1}: Invalid format (must be object)"
            
            # Check required fields
            if not smtp.get('host') or not isinstance(smtp.get('host'), str):
                return False, f"SMTP configuration {i + 1}: SMTP host is required"
            
            if not smtp.get('port') or not isinstance(smtp.get('port'), (int, str)):
                return False, f"SMTP configuration {i + 1}: Valid port is required"
            
            try:
                port = int(smtp.get('port'))
                if port <= 0 or port > 65535:
                    return False, f"SMTP configuration {i + 1}: Port must be between 1 and 65535"
            except (ValueError, TypeError):
                return False, f"SMTP configuration {i + 1}: Port must be a valid number"
            
            if not smtp.get('username') or not isinstance(smtp.get('username'), str):
                return False, f"SMTP configuration {i + 1}: Username is required"
            
            # Must have password OR appPassword OR oAuth2RefreshToken
            has_auth = (
                (smtp.get('password') and len(str(smtp.get('password')).strip()) > 0) or
                (smtp.get('appPassword') and len(str(smtp.get('appPassword')).strip()) > 0) or
                (smtp.get('oAuth2RefreshToken') and len(str(smtp.get('oAuth2RefreshToken')).strip()) > 0)
            )
            
            if not has_auth:
                return False, f"SMTP configuration {i + 1}: Password or app password or OAuth token is required"
    
    return True, ""


def validate_campaign_metadata(function_data: Dict) -> Tuple[bool, str]:
    """
    Main campaign validation orchestrator
    Validates campaign creation payload before storing in Google Sheets
    
    Args:
        function_data: Request form data containing campaign metadata
        
    Returns:
        Tuple[bool, str]: (is_valid, error_message)
    """
    try:
        function_name = function_data.get('functionName', '')
        
        # Only validate campaign creation function
        if function_name != 'createNewCampaign':
            return True, ""  # Skip validation for other functions
        
        # Parse strategyContext JSON
        strategy_context_str = function_data.get('strategyContext', '{}')
        try:
            strategy = json.loads(strategy_context_str)
        except json.JSONDecodeError as e:
            logger.error(f"Campaign validation: Failed to parse strategyContext JSON: {str(e)}")
            return False, f"Invalid campaign settings format: {str(e)}"
        
        # Validate campaign name
        is_valid, error = validate_campaign_name(strategy.get('name', ''))
        if not is_valid:
            return False, error
        
        # Validate channel
        channel = strategy.get('channel', '')
        is_valid, error = validate_campaign_channel(channel)
        if not is_valid:
            return False, error
        
        # Validate campaign type
        campaign_type = strategy.get('type', '')
        is_valid, error = validate_campaign_type(campaign_type)
        if not is_valid:
            return False, error
        
        # Validate email-specific fields
        subject = strategy.get('subject', '')
        is_valid, error = validate_email_subject(subject, channel)
        if not is_valid:
            return False, error
        
        body = strategy.get('body', '')
        is_valid, error = validate_email_body(body, channel)
        if not is_valid:
            return False, error
        
        # Validate file URL
        file_url = strategy.get('fileUrl', '')
        is_valid, error = validate_file_url(file_url, channel)
        if not is_valid:
            return False, error
        
        # Delivery method & SMTP validation (email-only)
        if channel == 'email':
            delivery_method = strategy.get('deliveryMethod', 'smtp')
            is_valid, error = validate_delivery_method(delivery_method)
            if not is_valid:
                return False, error
            
            smtp_settings = strategy.get('smtpSettings', [])
            is_valid, error = validate_smtp_settings(smtp_settings, delivery_method)
            if not is_valid:
                return False, error
        
        return True, ""
    
    except Exception as e:
        logger.error(f"Campaign validation error: {str(e)}")
        return False, f"Campaign validation error: {str(e)}"
