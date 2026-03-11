# alembic/ — Database Migrations (not yet needed)

This directory is a placeholder for [Alembic](https://alembic.sqlalchemy.org/),
a database migration tool.

## Why is this empty?

Right now, `scripts/ingest.py` creates the database tables from scratch every
time. This works fine for SQLite in development — you can just delete the
`.sqlite` file and re-run the ingest script.

## When will we need Alembic?

When we deploy to **PostgreSQL in production**, we can't just drop and recreate
tables — that would delete all the data. Alembic lets you write migration
scripts that modify the schema without losing data. For example:

```
alembic revision --autogenerate -m "add gene_name column to insertions"
alembic upgrade head
```

This would add a `gene_name` column to the existing `insertions` table in
production without touching any of the 44,984 existing rows.

## How to set up Alembic (when ready)

```bash
alembic init alembic
# Edit alembic/env.py to point at app.models.Base and app.database.DATABASE_URL
# Then: alembic revision --autogenerate -m "initial schema"
# Then: alembic upgrade head
```
