"""Double-submit CSRF protection.

Every state-changing request must send the CSRF cookie's value back in the X-CSRF-Token header.
A cross-site page can make the browser send cookies but cannot read them to copy the value.
SameSite=Lax on the session cookies is a second layer, not the only one.
"""

import hmac

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.cookies import CSRF_COOKIE

SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})


class CSRFMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.method not in SAFE_METHODS:
            cookie = request.cookies.get(CSRF_COOKIE.name, "")
            header = request.headers.get("x-csrf-token", "")
            if not cookie or not hmac.compare_digest(cookie, header):
                return JSONResponse({"detail": "CSRF check failed."}, status_code=403)
        return await call_next(request)
