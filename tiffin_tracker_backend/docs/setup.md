# Backend Setup Guide

## Prerequisites
- Python 3.11+
- MySQL 8.0+ (local or Railway)

## Local Development

### 1. Create and activate virtualenv
```bash
python3 -m venv env
source env/bin/activate
```

### 2. Install dependencies
```bash
pip install -r requirements.txt
```

### 3. Configure environment
```bash
cp .env.example .env
# Edit .env with your values
```

Required values:
| Variable | Description |
|---|---|
| `DATABASE_URL` | `mysql+aiomysql://USER:PASS@HOST:PORT/DB` |
| `SECRET_KEY` | Run: `python -c "import secrets; print(secrets.token_hex(32))"` |
| `GOOGLE_CLIENT_ID` | From Google Cloud Console (see below) |

### 4. Set up Google OAuth
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project → **APIs & Services → Credentials**
3. **Create Credentials → OAuth 2.0 Client ID → Web application**
4. Add authorized origins: `http://localhost:5173`
5. Copy the Client ID into both `.env` files (backend + frontend)

### 5. Create database and run migrations
```bash
# Create the database first
mysql -u root -p -e "CREATE DATABASE tiffin_tracker CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# Generate and run the initial migration
alembic revision --autogenerate -m "initial"
alembic upgrade head
```

### 6. Start the development server
```bash
uvicorn app.main:app --reload --port 8000
```

API docs available at: `http://localhost:8000/docs` (only when `DEBUG=true`)

## Railway Deployment

1. Install [Railway CLI](https://docs.railway.app/develop/cli): `npm install -g @railway/cli`
2. `railway login && railway init`
3. Add MySQL plugin from the Railway dashboard
4. Set all environment variables in Railway dashboard (copy from `.env.example`)
5. Set `CORS_ORIGINS=["https://your-vercel-app.vercel.app"]`
6. Push to deploy — `railway.toml` handles the start command

After first deploy, run migrations:
```bash
railway run alembic upgrade head
```

## Running Alembic Commands

```bash
# After changing models, create a new migration
alembic revision --autogenerate -m "description of change"

# Apply all pending migrations
alembic upgrade head

# Roll back one migration
alembic downgrade -1

# View migration history
alembic history
```
