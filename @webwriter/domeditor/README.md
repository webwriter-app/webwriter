# DOMEditor development server

Run the editor and its localhost backend together:

```sh
npm start
```

The server listens on `http://127.0.0.1:1234` and refuses non-loopback bind addresses. It has no authentication and must never be exposed to a network. The editor probes `/api/session`, automatically signs in to this no-auth development session, and uses server documents and server-managed AI providers by default. Click **Local dev** in the ribbon to open the admin dashboard, or visit `http://127.0.0.1:1234/admin`.

Data is stored in the ignored `.webwriter-dev/` directory. Provider files have owner-only permissions, but API keys are still stored as plaintext development secrets. `OPENAI_API_KEY` can instead be set in `.env.local`; it creates an OpenAI provider whose key stays in the environment.

## APIs

- `GET /api/session` — backend probe and no-auth login metadata
- `GET|POST /api/documents` and `GET|PUT|PATCH|DELETE /api/documents/:id` — document CRUD
- `GET|POST /api/providers` and `GET|PUT|PATCH|DELETE /api/providers/:id` — AI provider CRUD
- `PUT /api/providers/:id/active` — select the default provider
- `GET /api/inference/providers/:id/models` — list models through the provider
- `POST /api/inference/providers/:id/chat/completions` — Chat Completions proxy
- `POST /api/inference/providers/:id/responses` — Responses API proxy
- `ws://127.0.0.1:1234/:room` — Yjs collaboration using `@y/websocket-server`

Set `WEBWRITER_DEV_PORT` to use another port. `WEBWRITER_DEV_HOST` accepts only `127.0.0.1`, `::1`, or `localhost`.
