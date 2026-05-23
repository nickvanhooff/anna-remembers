"""Tests voor backend/routers/settings.py"""
from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from main import app
from models.setting import Setting
from services.database import get_db


def _mock_db_with_setting(key: str, value: str):
    mock_db = MagicMock()
    mock_setting = Setting(key=key, value=value)
    mock_db.query.return_value.all.return_value = [mock_setting]
    mock_db.query.return_value.filter.return_value.first.return_value = mock_setting
    return mock_db


class TestGetSettings:
    def test_returns_all_settings_as_dict(self):
        mock_db = _mock_db_with_setting("twilio_sms_enabled", "true")

        def override_get_db():
            return mock_db

        app.dependency_overrides[get_db] = override_get_db
        client = TestClient(app)
        try:
            response = client.get("/settings")
            assert response.status_code == 200
            assert response.json() == {"twilio_sms_enabled": "true"}
        finally:
            app.dependency_overrides.clear()


class TestPutSetting:
    def test_updates_existing_setting(self):
        mock_setting = Setting(key="twilio_sms_enabled", value="true")
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = mock_setting

        def override_get_db():
            return mock_db

        app.dependency_overrides[get_db] = override_get_db
        client = TestClient(app)
        try:
            response = client.put(
                "/settings/twilio_sms_enabled",
                json={"value": "false"},
            )
            assert response.status_code == 200
            assert response.json()["value"] == "false"
            assert mock_setting.value == "false"
            mock_db.commit.assert_called_once()
        finally:
            app.dependency_overrides.clear()

    def test_returns_404_for_unknown_key(self):
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = None

        def override_get_db():
            return mock_db

        app.dependency_overrides[get_db] = override_get_db
        client = TestClient(app)
        try:
            response = client.put("/settings/onbekende_key", json={"value": "x"})
            assert response.status_code == 404
        finally:
            app.dependency_overrides.clear()
