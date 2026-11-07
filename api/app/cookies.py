from dataclasses import dataclass

from fastapi import Response

from app.config import get_settings


@dataclass(frozen=True)
class CookieSpec:
    base: str
    http_only: bool
    path: str = "/"

    @property
    def name(self) -> str:
        # __Host- binds the cookie to this exact host over HTTPS, with no Domain attribute.
        return f"__Host-{self.base}" if get_settings().cookie_secure else self.base


ACCESS_COOKIE = CookieSpec("sp_access", http_only=True)
REFRESH_COOKIE = CookieSpec("sp_refresh", http_only=True)
CSRF_COOKIE = CookieSpec("sp_csrf", http_only=False)


def set_cookie(response: Response, spec: CookieSpec, value: str, max_age: int) -> None:
    response.set_cookie(
        spec.name,
        value,
        max_age=max_age,
        path=spec.path,
        secure=get_settings().cookie_secure,
        httponly=spec.http_only,
        samesite="lax",
    )


def clear_cookie(response: Response, spec: CookieSpec) -> None:
    response.delete_cookie(
        spec.name, path=spec.path, secure=get_settings().cookie_secure, samesite="lax"
    )
