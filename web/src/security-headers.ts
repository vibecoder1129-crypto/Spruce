/**
 * One CSP for every page.
 *
 * script-src keeps 'unsafe-inline' because Next.js partial prerendering ships inline
 * bootstrap scripts in a static shell that a per-request nonce cannot reach (we tried:
 * the nonce policy blocked hydration). What still protects a session if markup were ever
 * injected: session cookies are httpOnly (scripts cannot read them), state changes need
 * the CSRF token, connect-src/form-action/img-src stop data being sent to other hosts,
 * and no third-party script is loaded anywhere. Revisit when Next supports hashes for
 * its inline scripts (tracked in docs/slices/01-accounts.md).
 */
export function contentSecurityPolicy(isDev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}
