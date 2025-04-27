# WebFixx-Hoo API

A Flask-based API service with Web3 integration and AI-powered webpage analysis.

## Features
- Web3 wallet management and transaction monitoring
- Webpage content analysis and summarization using OpenAI GPT
- Rate-limited API endpoints
- CORS support
- Environment-based configuration

## Setup

1. Create virtual environment:
```powershell
python -m venv .venv
```

2. Activate virtual environment (Windows PowerShell):
```powershell
.\.venv\Scripts\Activate.ps1
```

3. Install dependencies:
```powershell
python -m pip install -r requirements.txt
```

4. Create `.env` file with required credentials:
```ini
# Network Configuration
INFURA_URL=https://mainnet.infura.io/v3/YOUR_PROJECT_ID
INFURA_PROJECT_ID=your_project_id
INFURA_SECRET=your_secret

# Bitcoin Configuration
BTC_NETWORK=mainnet
BLOCKCYPHER_TOKEN=your_blockcypher_token

# Contract Addresses
USDT_CONTRACT_ADDRESS=0xdAC17F958D2ee523a2206206994597C13D831ec7

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key
```

## Development

Update requirements.txt:
```powershell
python -m pip freeze > requirements.txt
```

Run tests:
```powershell
python -m pytest
```

## Deployment

Run locally:
```powershell
python api/index.py
```

Deploy to Vercel:
1. Fork this repository
2. Import to Vercel
3. Add environment variables
4. Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fyourusername%2FWebFixx-Hoo)

## API Endpoints

### Web3 Routes
- GET `/api/get_exchange_rates` - Get current exchange rates
- GET `/api/check_transaction` - Check transaction status
- POST `/api/create_wallet` - Create new wallet

### AI Routes
- POST `/api/ask_model` - Analyze and summarize webpage content

### Authentication Routes
- POST `/api/login` - User login
- POST `/api/register` - User registration
- POST `/api/reset-password` - Password reset

## Rate Limits
- Login/Register: 5 requests per minute
- Wallet creation: 5 requests per minute
- General API calls: 10 requests per minute
