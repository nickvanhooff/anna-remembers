from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Base class voor alle SQLAlchemy modellen.

    Alembic gebruikt Base.metadata om te detecteren welke tabellen
    aangemaakt of gewijzigd moeten worden bij een migratie.
    """
    pass
