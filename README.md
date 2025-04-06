# Vercel Flask Application

## Setup

1. Create virtual environment:
```bash
python -m venv .venv
```

2. Activate virtual environment:
```bash
.venv\Scripts\activate
```

3. Install dependencies:
```bash
python -m pip install -r requirements.txt
python -m pip install web3 python-bitcoinlib blockcypher requests
```

## Development

To update requirements.txt:
```bash
python -m pip freeze > requirements.txt
```

## Deployment
Run locally:
```bash
python api/index.py
```

Deploy to Vercel:
[![Deploy to Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/caibingcheng/vercel-flask)
