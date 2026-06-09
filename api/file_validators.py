"""
File Validators for WebFixx Campaign CSV Uploads
Enforces security constraints: 100KB max size, CSV-only format, malicious content scanning
"""

import base64
import logging
import re
from typing import Tuple

logger = logging.getLogger(__name__)

# Configuration Constants
MAX_SIZE_KB = 100
MAX_SIZE_BYTES = MAX_SIZE_KB * 1024  # 102,400 bytes

ALLOWED_EXTENSIONS = ['csv']

ALLOWED_MIME_TYPES = [
    'text/csv',
    'text/plain',
    'application/csv',
    'application/x-csv',
    'application/vnd.ms-excel'
]

# Malicious patterns that could indicate script injection or executable code
FORBIDDEN_PATTERNS = [
    r'<script',
    r'javascript:',
    r'onclick',
    r'onerror',
    r'eval\(',
    r'exec\(',
    r'__import__',
    r'\.exe',
    r'\.bat',
    r'\.cmd',
    r'\.php',
    r'<%',
    r'<jsp',
    r'<cfscript',
    r'<object',
    r'<embed',
    r'<iframe',
    r'<applet',
    r'\.sh\b',
    r'\.bin\b',
    r'powershell',
    r'cmd\.exe',
    r'bash\s',
    r'sh\s',
]


def validate_file_size(file_content_base64: str) -> Tuple[bool, str]:
    """
    Validate that file size does not exceed 100KB
    
    Args:
        file_content_base64: Base64-encoded file content
        
    Returns:
        Tuple[bool, str]: (is_valid, error_message)
    """
    try:
        # Decode base64 to get actual file size
        file_content = base64.b64decode(file_content_base64)
        file_size = len(file_content)
        
        if file_size == 0:
            return False, "File is empty"
        
        if file_size > MAX_SIZE_BYTES:
            size_kb = file_size / 1024
            return False, f"File is too large ({size_kb:.1f}KB). Maximum size is {MAX_SIZE_KB}KB."
        
        return True, ""
    
    except Exception as e:
        logger.error(f"Error validating file size: {str(e)}")
        return False, f"File size validation error: {str(e)}"


def validate_file_extension(filename: str) -> Tuple[bool, str]:
    """
    Validate that file extension is .csv
    
    Args:
        filename: Name of the file
        
    Returns:
        Tuple[bool, str]: (is_valid, error_message)
    """
    if not filename:
        return False, "Filename is missing"
    
    # Extract extension
    parts = filename.lower().split('.')
    if len(parts) < 2:
        return False, "Filename has no extension. Please upload a .csv file"
    
    extension = parts[-1]
    
    if extension not in ALLOWED_EXTENSIONS:
        return False, f"File type '.{extension}' is not allowed. Only .csv files are accepted."
    
    return True, ""


def validate_file_mime_type(mime_type: str) -> Tuple[bool, str]:
    """
    Validate that MIME type is in allowed list
    
    Args:
        mime_type: MIME type of the file
        
    Returns:
        Tuple[bool, str]: (is_valid, error_message)
    """
    if not mime_type:
        return False, "MIME type is missing"
    
    mime_type_lower = mime_type.lower().strip()
    
    if mime_type_lower not in ALLOWED_MIME_TYPES:
        return False, f"MIME type '{mime_type}' is not allowed. Expected text/csv or text/plain."
    
    return True, ""


def validate_file_content(file_content_base64: str) -> Tuple[bool, str]:
    """
    Scan file content for malicious patterns and encoding issues
    
    Args:
        file_content_base64: Base64-encoded file content
        
    Returns:
        Tuple[bool, str]: (is_valid, error_message)
    """
    try:
        # Decode base64
        file_content_bytes = base64.b64decode(file_content_base64)
        
        # Try to decode as UTF-8 (CSV should be text)
        try:
            file_content_text = file_content_bytes.decode('utf-8')
        except UnicodeDecodeError:
            try:
                # Try latin-1 as fallback
                file_content_text = file_content_bytes.decode('latin-1')
            except UnicodeDecodeError:
                return False, "File encoding is not valid. Please ensure CSV is UTF-8 encoded."
        
        # Check for BOM (Byte Order Mark) and warn
        if file_content_text.startswith('\ufeff'):
            file_content_text = file_content_text[1:]
        
        # Scan for forbidden patterns (case-insensitive)
        file_content_lower = file_content_text.lower()
        
        for pattern in FORBIDDEN_PATTERNS:
            if re.search(pattern, file_content_lower, re.IGNORECASE):
                logger.warning(f"Forbidden pattern detected in file: {pattern}")
                return False, f"File contains potentially malicious content ({pattern}). Please verify the file source."
        
        return True, ""
    
    except Exception as e:
        logger.error(f"Error validating file content: {str(e)}")
        return False, f"File content validation error: {str(e)}"


def validate_campaign_csv(
    filename: str,
    mime_type: str,
    file_content_base64: str
) -> Tuple[bool, str]:
    """
    Main validation orchestrator - runs all validators in sequence
    
    Args:
        filename: Name of the uploaded file
        mime_type: MIME type of the file
        file_content_base64: Base64-encoded file content
        
    Returns:
        Tuple[bool, str]: (is_valid, error_message)
    """
    # Validate extension first (fastest)
    is_valid, error = validate_file_extension(filename)
    if not is_valid:
        return False, error
    
    # Validate MIME type
    is_valid, error = validate_file_mime_type(mime_type)
    if not is_valid:
        return False, error
    
    # Validate file size
    is_valid, error = validate_file_size(file_content_base64)
    if not is_valid:
        return False, error
    
    # Validate content for malicious patterns
    is_valid, error = validate_file_content(file_content_base64)
    if not is_valid:
        return False, error
    
    return True, ""


def validate_upload_campaign_csv(function_data: dict) -> Tuple[bool, str]:
    """
    Validate a campaign CSV upload function call
    Extracts parameters from function_data and runs validation
    
    Args:
        function_data: Dictionary containing request form data
                      Expected keys: fileName, fileMimeType, fileContent (base64)
        
    Returns:
        Tuple[bool, str]: (is_valid, error_message)
    """
    try:
        # Extract parameters
        filename = function_data.get('fileName', '')
        mime_type = function_data.get('fileMimeType', '')
        file_content_base64 = function_data.get('fileContent', '')
        
        # Basic parameter validation
        if not filename:
            return False, "fileName parameter is missing"
        if not mime_type:
            return False, "fileMimeType parameter is missing"
        if not file_content_base64:
            return False, "fileContent parameter is missing (empty file)"
        
        # Run full validation
        return validate_campaign_csv(filename, mime_type, file_content_base64)
    
    except Exception as e:
        logger.error(f"Error in upload campaign CSV validation: {str(e)}")
        return False, f"Validation error: {str(e)}"
