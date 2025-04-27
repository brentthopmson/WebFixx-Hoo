import logging
import os
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

# Load environment variables
load_dotenv()

# Validate required environment variables
required_vars = [
    'APPSCRIPT_URL',
    'SCRIPT_KEY',
    'INFURA_URL',
    'INFURA_PROJECT_ID',
    'OPENAI_API_KEY'
]

missing_vars = [var for var in required_vars if not os.getenv(var)]
if missing_vars:
    raise EnvironmentError(f"Missing required environment variables: {', '.join(missing_vars)}")