# Farm Traceability — Farmer Crop Entry

This repository implements only the first vertical slice of the B.E. major project:

**Farmer → Farmer View → Crop Entry → Crop Info Management → Relational Database**

## Stack

- Frontend: Vue 3 + TypeScript + Vite
- Backend: Python + FastAPI + Pydantic
- ORM: SQLAlchemy 2.0
- Database: PostgreSQL (Supabase recommended for the live demo)
- Migrations: Alembic

## Live demo deployment (recommended)

Use **Vercel + Supabase**. Docker is not required.

See `docs/DEPLOY_VERCEL_SUPABASE.md` for the complete setup.

## Scope

Only Farmer Crop Entry and Crop Info Management are implemented at this stage. Blockchain, AI price prediction, supplier/retailer tracking, consumer verification, transaction services, and traceability services are deliberately not implemented yet.
