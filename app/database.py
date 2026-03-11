"""
Database engine and session factory.

This is the ONLY file in app/ that knows which database we're connecting to.
Everything else (models, routers) imports from here and doesn't care whether
it's SQLite or PostgreSQL underneath.

HOW IT WORKS:
    1. Reads DATABASE_URL from the environment (defaults to local SQLite file)
    2. Creates a SQLAlchemy engine (the connection to the database)
    3. Creates a session factory (SessionLocal) that produces sessions
    4. Provides get_db() — a generator that FastAPI uses to give each HTTP
       request its own database session, and auto-closes it when done

WHAT IS A SESSION?
    A session is like a conversation with the database. You open one, run some
    queries, and close it. FastAPI opens a new session for each HTTP request
    and closes it when the response is sent. This prevents one request from
    interfering with another.

WHAT IS DEPENDENCY INJECTION?
    FastAPI can automatically call get_db() and pass the result to your route
    function. You write:
        def get_insertion(id: str, db: Session = Depends(get_db)):
    And FastAPI handles creating the session, passing it in, and closing it.
    You never call get_db() yourself — FastAPI does it for you.

SWITCHING TO POSTGRESQL:
    Set the DATABASE_URL environment variable:
        export DATABASE_URL="postgresql://user:pass@localhost:5432/dbrip"
    Everything else stays the same — the ORM models, routers, and queries
    all work identically on both SQLite and PostgreSQL.
"""

import os
from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

# ── Configuration ────────────────────────────────────────────────────────

# Default: SQLite file in the project root (created by scripts/ingest.py)
# Override: set DATABASE_URL env var for PostgreSQL in production
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///dbrip.sqlite")

# ── Engine ───────────────────────────────────────────────────────────────

# connect_args={"check_same_thread": False} is needed for SQLite only —
# SQLite by default only allows the thread that created the connection to use it.
# FastAPI runs requests in a thread pool, so we need to disable this check.
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

    # Enable foreign key enforcement for SQLite (it's OFF by default)
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()
else:
    engine = create_engine(DATABASE_URL)

# ── Session factory ─────────────────────────────────────────────────────

# sessionmaker creates a "factory" — calling SessionLocal() gives you a new session.
# autocommit=False: you must explicitly commit (we don't commit since the API is read-only)
# autoflush=False: don't auto-sync Python objects to the DB (prevents surprises)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)

# ── Dependency for FastAPI ───────────────────────────────────────────────


def get_db() -> Generator[Session]:
    """Yield a database session for a single request, then close it.

    Usage in a FastAPI route:
        @router.get("/insertions/{id}")
        def get_insertion(id: str, db: Session = Depends(get_db)):
            return db.query(Insertion).get(id)

    The session is automatically closed when the request finishes,
    even if an error occurs (that's what the finally block does).
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
