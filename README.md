# Vercel Flask Application

## Setup

1. Create virtual environment:
```bash
python -m venv .venv
```

2. Activate virtual environment (Windows PowerShell):
```powershell
.\.venv\Scripts\Activate.ps1
```

3. Install base dependencies:
```bash
python -m pip install -r requirements.txt
```

4. Install AI dependencies:
```bash
python -m pip install langchain openai beautifulsoup4 transformers
```

## Development

To update requirements.txt with all installed packages:
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
