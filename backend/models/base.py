from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models.

    Alembic uses Base.metadata to detect which tables
    must be created or changed during a migration.
    """
    pass
