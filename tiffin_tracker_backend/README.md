# Tiffin Tracker — Backend

FastAPI + MySQL backend for the Tiffin Tracker SaaS operator dashboard.

## Quick Start

```bash
python3 -m venv env && source env/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in your values
mysql -u root -p -e "CREATE DATABASE tiffin_tracker CHARACTER SET utf8mb4;"
alembic revision --autogenerate -m "initial" && alembic upgrade head
uvicorn app.main:app --reload
```

See [docs/setup.md](docs/setup.md) for full setup and Railway deployment instructions.

## API Endpoints (Week 1)

| Method | Path | Description |
|---|---|---|
| `POST` | `/auth/google` | Verify Google ID token, return JWT |
| `GET` | `/auth/me` | Get current operator profile |
| `PATCH` | `/auth/me` | Update profile (name, phone, UPI ID) |
| `GET` | `/subscribers` | List subscribers (optional `?status=active`) |
| `POST` | `/subscribers` | Create subscriber |
| `GET` | `/subscribers/{id}` | Get subscriber |
| `PUT` | `/subscribers/{id}` | Update subscriber |
| `DELETE` | `/subscribers/{id}` | Cancel subscriber (soft delete) |
| `GET` | `/plans` | List plans |
| `POST` | `/plans` | Create plan |
| `PUT` | `/plans/{id}` | Update plan |
| `DELETE` | `/plans/{id}` | Deactivate plan |
| `GET` | `/health` | Health check |

## Tech Stack

- **FastAPI** + **Uvicorn** — async web framework
- **SQLAlchemy 2.0** (async) + **Alembic** — ORM and migrations
- **MySQL 8** via **aiomysql** driver
- **Google Auth** — operator authentication via Google ID tokens
- **python-jose** — JWT signing/verification
- **pydantic-settings** — typed config from `.env`
