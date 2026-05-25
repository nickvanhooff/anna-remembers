"""Setting model — stores application settings as key-value pairs."""

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base


class Setting(Base):
    """Persistent key-value store for application settings.

    Examples: twilio_sms_enabled, default_escalation_channel, etc.
    """

    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(String(500), nullable=False)
