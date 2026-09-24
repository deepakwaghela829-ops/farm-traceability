# Live demo: Vercel + Supabase (no Docker)

This project can be demonstrated without a local PostgreSQL server or Docker.

## Architecture

- Vue 3 + Vite frontend: Vercel
- FastAPI + Python backend: Vercel Python Function
- PostgreSQL: Supabase

## 1. Create the Supabase database

Create a Supabase project and open **Connect**. For the deployed Vercel function, use the **Transaction Pooler** connection string (port `6543`). Supabase recommends transaction pooling for serverless/edge functions and recommends `NullPool` plus prepared statements disabled for SQLAlchemy in that mode.

Set these Vercel environment variables:

`DATABASE_URL`

Use the Supabase transaction pooler URL, converted to SQLAlchemy's psycopg form:

`postgresql+psycopg://USER:PASSWORD@POOLER_HOST:6543/postgres`

`API_CORS_ORIGINS` can be the Vercel deployment URL. Same-origin frontend calls do not need CORS, but keeping it set is convenient if you later run the frontend separately.

## 2. Run the migration

For migrations, Supabase recommends a normal/single-session connection rather than transaction pooling. Set `MIGRATION_DATABASE_URL` locally to the Supabase Session Pooler URL (port `5432`) or a direct connection, then run:

```bash
cd backend
pip install -r requirements.txt
python -m alembic upgrade head
```

Do not commit `.env`.

## 3. Deploy to Vercel

Import this repository into Vercel from the repository root. No Docker is required. The root `vercel.json` builds `frontend/` and exposes `api/index.py` as the FastAPI entrypoint.

Vercel will build the Vue app to `frontend/dist` and serve FastAPI under `/api/*`.

## 4. Verify

Open:

- `/` — Farmer Crop Entry UI
- `/api/health` — FastAPI health endpoint
- `/api/docs` — FastAPI Swagger UI

Then submit a crop from the UI and verify the row appears in Supabase Table Editor.

## 5. Local development

Start FastAPI locally:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Start Vue in a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Vite proxies `/api` to `http://127.0.0.1:8000`.
