# Cloud service contract (v1)

The frontend preset is `https://edumix.eu`. Custom URLs use the same contract.
For a provider URL `https://host/prefix`, discovery is `GET /prefix/api/session`;
a URL ending in `/api` is already an API base. Startup discovers `/api/session`
on the app's host, with a loopback port-1234 fallback for development only.
An existing active provider or an explicit Local selection takes precedence.

## Discovery and sign-in

Public `GET /api/session` returns JSON metadata, even before sign-in:

```json
{
  "kind": "webwriter-cloud-service",
  "version": 1,
  "authentication": "bearer",
  "signInUrl": "https://host/api/sign-in",
  "apiBaseUrl": "https://host/api",
  "collaborationUrl": "wss://host",
  "adminUrl": "https://host/admin",
  "capabilities": ["documents"],
  "user": null
}
```

`POST signInUrl` accepts JSON `{ "username": "…", "password": "…" }`.
Success returns `{ "accessToken": "…", "expiresIn": 3600, "session": { … } }`.
The session has the metadata above plus `user: { "id": "stable-id", "name": "Display name" }`.
Alternatively return `expiresAt` as Unix epoch **milliseconds**; it takes
precedence over `expiresIn` (seconds). JWT `exp` is the fallback expiry hint.
No refresh token is required; expiry requires signing in again.

### Sign-in on an identity provider

Instead of `signInUrl`, a service may advertise an OpenID Connect provider:

```json
"oidc": { "issuer": "https://auth.example/realms/edumix", "clientId": "webwriter" }
```

WebWriter then never asks for a password. "Sign in" leaves for the provider's login
page (Authorization Code + PKCE with `oidc-client-ts`, public client, redirect URI
`<app origin>/editor/`) and returns with an access token, which it sends as the
bearer token like a password sign-in's. The issuer must be HTTPS (HTTP on loopback).
The service validates that token (signature, issuer, its own audience, the client
as `azp`). Access tokens are short-lived; WebWriter renews them shortly before
expiry with the provider's refresh token and signs out when that fails. The Edumix
preset is `VITE_EDUMIX_URL` at build time, `https://edumix.eu` by default.

Authenticated `GET /api/session` accepts `Authorization: Bearer <accessToken>`
and returns the session with its user, validating a saved token on reload.
Use HTTP 401 for expired/revoked tokens. Other failures may return
`{ "message": "…" }` or `{ "error": { "message": "…" } }`.

API, sign-in and admin URLs must share the provider origin; collaboration must
use the equivalent secure WebSocket origin. Use HTTPS, except HTTP on loopback.
Redirects are rejected. Support CORS from the app origin, including `OPTIONS`,
`Authorization`, `Content-Type`, and the methods below; requests omit cookies.

## Documents

All paths are relative to `apiBaseUrl` and accept bearer authorization:

| Request | Response |
| --- | --- |
| `GET documents` | `{ "documents": [summary, …] }` |
| `GET documents/:id` | `{ "document": document }` |
| `POST documents` with `{ title, content, format }` | `{ "document": document }` |
| `PATCH documents/:id` with changed fields | `{ "document": document }` |
| `DELETE documents/:id` | HTTP 204 |

A summary has `id`, `title`, `format` (`html` or `offline`), `createdAt` and
`updatedAt` (ISO timestamps). A document additionally has `content` (HTML).
IDs are URL-encoded. Optional `providers`/`inference` capabilities use the
existing development-server APIs; collaboration uses the existing Yjs protocol.
This contract does not yet define authenticated WebSocket admission.

## Browser persistence

`webwriter_app_settings_v1` stores `localUsername`, `cloudServices` and one
`activeCloudServiceId` (or `null` for Local). Each service stores `id`,
`type` (`edumix` or `url`), `url`, `username`, and optional `accessToken`/`expiresAt`.
The no-auth dev server additionally stores `authentication: "none"`.
Passwords are submitted only during sign-in and never persisted. Local expiry
or HTTP 401 clears the token and adds warning bubbles to File and Settings.
