import json
import logging

from app.logging import JsonFormatter


def _format(msg: str, **extra: object) -> dict[str, object]:
    record = logging.LogRecord("t", logging.INFO, __file__, 1, msg, None, None)
    for key, value in extra.items():
        setattr(record, key, value)
    return json.loads(JsonFormatter().format(record))  # type: ignore[no-any-return]


def test_personal_fields_are_masked() -> None:
    out = _format("login", email="ana@example.lv", phone="+371 2000", user_id=7)
    assert out["email"] == "[redacted]"
    assert out["phone"] == "[redacted]"
    assert out["user_id"] == 7


def test_emails_inside_messages_are_masked() -> None:
    out = _format("could not reach ana@example.lv")
    assert out["msg"] == "could not reach [email]"


def test_nested_personal_fields_are_masked() -> None:
    out = _format("x", context={"customer": {"email": "a@b.lv", "visits": 3}})
    assert out["context"] == {"customer": {"email": "[redacted]", "visits": 3}}
