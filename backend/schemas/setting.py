"""Pydantic schemas for the settings API."""

from pydantic import BaseModel


class SettingUpdate(BaseModel):
    """Schema for updating a setting value."""

    value: str


class SettingResponse(BaseModel):
    """Schema for a setting returned from the API."""

    key: str
    value: str

    model_config = {"from_attributes": True}
