"""JSON logs that never carry personal data.

Log records are structured; any field whose name looks like personal data is masked before
output, so a careless `logger.info(..., extra={"email": ...})` cannot leak it (GDPR art. 32).
"""

import json
import logging
import re
from typing import Any

_PII_KEYS = re.compile(
    r"(email|phone|name|address|password|token|secret|cookie|authorization)", re.I
)
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_STANDARD = set(logging.LogRecord("", 0, "", 0, "", None, None).__dict__) | {"message"}


def redact(value: Any) -> Any:
    if isinstance(value, str):
        return _EMAIL.sub("[email]", value)
    if isinstance(value, dict):
        return {k: "[redacted]" if _PII_KEYS.search(k) else redact(v) for k, v in value.items()}
    if isinstance(value, list | tuple):
        return [redact(v) for v in value]
    return value


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "level": record.levelname,
            "logger": record.name,
            "msg": redact(record.getMessage()),
        }
        extras = {k: v for k, v in record.__dict__.items() if k not in _STANDARD}
        payload.update(redact(extras))
        if record.exc_info:
            payload["exc"] = record.exc_info[0].__name__ if record.exc_info[0] else None
        return json.dumps(payload, default=str)


def configure_logging(level: str) -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)
