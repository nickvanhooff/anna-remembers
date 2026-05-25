"""Tests for backend/services/notification.py"""
import uuid
from unittest.mock import MagicMock, patch

import pytest

from services.notification import _build_sms, send_sms_notification


class TestBuildSms:
    def test_high_urgency_tag(self):
        result = _build_sms("Jan de Vries", "high", "Ernstige benauwdheid")
        assert "[Anna] URGENT" in result

    def test_medium_urgency_tag(self):
        result = _build_sms("Jan de Vries", "medium", "Lichte klachten")
        assert "[Anna] Let op" in result

    def test_low_urgency_tag(self):
        result = _build_sms("Jan de Vries", "low", "Lichte klachten")
        assert "[Anna] Let op" in result

    def test_contains_patient_name(self):
        result = _build_sms("Maria Jansen", "high", "Test reden")
        assert "Maria Jansen" in result

    def test_extracts_patient_message_from_formatted_reason(self):
        """Extracts «msg» from 'Laag X · Patiëntbericht: «msg» · detail' format."""
        reason = "Laag 1 (qwen2.5:3b) · Patiëntbericht: «Ik krijg geen lucht» · ademhalingsproblemen"
        result = _build_sms("Jan", "high", reason)
        assert "Ik krijg geen lucht" in result
        assert "Laag 1" not in result

    def test_uses_raw_reason_when_no_special_format(self):
        result = _build_sms("Jan de Vries", "high", "Kortademigheid toegenomen")
        assert "Kortademigheid toegenomen" in result

    def test_truncates_long_messages(self):
        long_reason = "A" * 200
        result = _build_sms("Jan de Vries", "high", long_reason)
        assert len(result) <= 160
        assert result.endswith("…")

    def test_fits_single_sms_segment(self):
        result = _build_sms("Manis de fretes", "high", "Ik kan niet ademen")
        assert len(result) <= 160


class TestSendSmsNotification:
    def test_skips_when_not_configured(self, caplog):
        """No Twilio config = silently skip, no crash."""
        import logging
        with patch.dict("os.environ", {}, clear=True):
            with patch("services.notification._ACCOUNT_SID", None):
                with patch("services.notification._AUTH_TOKEN", None):
                    with patch("services.notification._FROM", None):
                        with patch("services.notification._TO", None):
                            with caplog.at_level(logging.INFO, logger="services.notification"):
                                send_sms_notification(uuid.uuid4())
        assert "niet geconfigureerd" in caplog.text

    def test_sends_sms_and_updates_status_to_sent(self):
        """Successful SMS → notification_status = 'sent'."""
        from models.setting import Setting

        escalation_id = uuid.uuid4()

        mock_patient = MagicMock()
        mock_patient.first_name = "Jan"
        mock_patient.last_name = "de Vries"

        mock_escalation = MagicMock()
        mock_escalation.urgency = "high"
        mock_escalation.reason = "Ernstige benauwdheid"
        mock_escalation.patient = mock_patient

        mock_setting = MagicMock(spec=Setting)
        mock_setting.value = "true"

        mock_twilio_to = MagicMock(spec=Setting)
        mock_twilio_to.value = ""  # leeg → fallback naar _TO env var

        mock_db = MagicMock()
        # Chain: query().filter().first() for setting, then query().options().filter().first() for escalation
        mock_db.query.return_value.filter.return_value.first.side_effect = [
            mock_setting,  # first call: twilio_sms_enabled setting query
            mock_twilio_to,  # second call: twilio_to setting query
        ]
        mock_db.query.return_value.options.return_value.filter.return_value.first.return_value = mock_escalation

        mock_twilio_client = MagicMock()

        with patch("services.notification._ACCOUNT_SID", "ACtest"):
            with patch("services.notification._AUTH_TOKEN", "token"):
                with patch("services.notification._FROM", "+15550000000"):
                    with patch("services.notification._TO", "+31600000000"):
                        with patch("services.notification.SessionLocal", return_value=mock_db):
                            with patch("services.notification.Client", return_value=mock_twilio_client):
                                send_sms_notification(escalation_id)

        mock_twilio_client.messages.create.assert_called_once()
        call_kwargs = mock_twilio_client.messages.create.call_args.kwargs
        assert "URGENT" in call_kwargs["body"]
        assert mock_escalation.notification_status == "sent"
        mock_db.commit.assert_called()

    def test_sets_failed_on_twilio_error(self):
        """Twilio error → notification_status = 'failed', no crash."""
        from twilio.base.exceptions import TwilioRestException
        from models.setting import Setting

        escalation_id = uuid.uuid4()

        mock_patient = MagicMock()
        mock_patient.first_name = "Jan"
        mock_patient.last_name = "de Vries"

        mock_escalation = MagicMock()
        mock_escalation.urgency = "medium"
        mock_escalation.reason = "Lichte klachten"
        mock_escalation.patient = mock_patient

        mock_setting = MagicMock(spec=Setting)
        mock_setting.value = "true"

        mock_twilio_to = MagicMock(spec=Setting)
        mock_twilio_to.value = ""  # leeg → fallback naar _TO env var

        mock_db = MagicMock()
        # Chain: query().filter().first() for setting, then query().options().filter().first() for escalation
        mock_db.query.return_value.filter.return_value.first.side_effect = [
            mock_setting,  # first call: twilio_sms_enabled setting query
            mock_twilio_to,  # second call: twilio_to setting query
        ]
        mock_db.query.return_value.options.return_value.filter.return_value.first.return_value = mock_escalation

        mock_twilio_client = MagicMock()
        mock_twilio_client.messages.create.side_effect = TwilioRestException(
            status=400, uri="/Messages", msg="Test error"
        )

        with patch("services.notification._ACCOUNT_SID", "ACtest"):
            with patch("services.notification._AUTH_TOKEN", "token"):
                with patch("services.notification._FROM", "+15550000000"):
                    with patch("services.notification._TO", "+31600000000"):
                        with patch("services.notification.SessionLocal", return_value=mock_db):
                            with patch("services.notification.Client", return_value=mock_twilio_client):
                                send_sms_notification(escalation_id)

        assert mock_escalation.notification_status == "failed"

    def test_uses_db_twilio_to_when_set(self):
        """Als twilio_to in DB non-leeg is, wordt dat nummer gebruikt i.p.v. _TO env var."""
        from models.setting import Setting

        escalation_id = uuid.uuid4()

        mock_patient = MagicMock()
        mock_patient.first_name = "Jan"
        mock_patient.last_name = "de Vries"

        mock_escalation = MagicMock()
        mock_escalation.urgency = "high"
        mock_escalation.reason = "Ernstige benauwdheid"
        mock_escalation.patient = mock_patient

        mock_sms_enabled = MagicMock(spec=Setting)
        mock_sms_enabled.value = "true"

        mock_twilio_to = MagicMock(spec=Setting)
        mock_twilio_to.value = "+31699999999"

        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.side_effect = [
            mock_sms_enabled,
            mock_twilio_to,
        ]
        mock_db.query.return_value.options.return_value.filter.return_value.first.return_value = mock_escalation

        mock_twilio_client = MagicMock()

        with patch("services.notification._ACCOUNT_SID", "ACtest"):
            with patch("services.notification._AUTH_TOKEN", "token"):
                with patch("services.notification._FROM", "+15550000000"):
                    with patch("services.notification._TO", "+31600000000"):
                        with patch("services.notification.SessionLocal", return_value=mock_db):
                            with patch("services.notification.Client", return_value=mock_twilio_client):
                                send_sms_notification(escalation_id)

        call_kwargs = mock_twilio_client.messages.create.call_args.kwargs
        assert call_kwargs["to"] == "+31699999999"

    def test_falls_back_to_env_when_db_twilio_to_empty(self):
        """Als twilio_to in DB leeg is, wordt _TO env var gebruikt."""
        from models.setting import Setting

        escalation_id = uuid.uuid4()

        mock_patient = MagicMock()
        mock_patient.first_name = "Jan"
        mock_patient.last_name = "de Vries"

        mock_escalation = MagicMock()
        mock_escalation.urgency = "high"
        mock_escalation.reason = "Ernstige benauwdheid"
        mock_escalation.patient = mock_patient

        mock_sms_enabled = MagicMock(spec=Setting)
        mock_sms_enabled.value = "true"

        mock_twilio_to = MagicMock(spec=Setting)
        mock_twilio_to.value = ""

        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.side_effect = [
            mock_sms_enabled,
            mock_twilio_to,
        ]
        mock_db.query.return_value.options.return_value.filter.return_value.first.return_value = mock_escalation

        mock_twilio_client = MagicMock()

        with patch("services.notification._ACCOUNT_SID", "ACtest"):
            with patch("services.notification._AUTH_TOKEN", "token"):
                with patch("services.notification._FROM", "+15550000000"):
                    with patch("services.notification._TO", "+31600000000"):
                        with patch("services.notification.SessionLocal", return_value=mock_db):
                            with patch("services.notification.Client", return_value=mock_twilio_client):
                                send_sms_notification(escalation_id)

        call_kwargs = mock_twilio_client.messages.create.call_args.kwargs
        assert call_kwargs["to"] == "+31600000000"


class TestSmsDisabledSetting:
    def test_skips_sms_when_setting_is_false(self, caplog):
        """When twilio_sms_enabled=false, no SMS despite valid config."""
        import logging
        from models.setting import Setting

        mock_setting = MagicMock(spec=Setting)
        mock_setting.value = "false"

        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.side_effect = [
            mock_setting,  # first call: setting query
        ]

        with patch("services.notification._ACCOUNT_SID", "ACtest"):
            with patch("services.notification._AUTH_TOKEN", "token"):
                with patch("services.notification._FROM", "+15550000000"):
                    with patch("services.notification._TO", "+31600000000"):
                        with patch("services.notification.SessionLocal", return_value=mock_db):
                            with caplog.at_level(logging.INFO, logger="services.notification"):
                                send_sms_notification(uuid.uuid4())

        assert "uitgeschakeld" in caplog.text
