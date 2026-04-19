# shop-3d-backend

## Environment

Set a remote MongoDB connection string in `.env` using `MONGO_URI`.

Example:

```
MONGO_URI=mongodb+srv://<user>:<pass>@cluster0.example.mongodb.net/shop-3d-backend?retryWrites=true&w=majority
```

The app now requires a Mongo URI and will not fall back to a local `127.0.0.1` database.

## Security toggles

Recommended baseline in `.env`:

```
ALLOW_COOKIE_AUTH=false
SESSION_BINDING_MODE=report
CSP_ENABLED=true
```

Rollout path for session binding:

1. Start with `SESSION_BINDING_MODE=report` and monitor logs.
2. After frontend token refresh rollout, switch to `SESSION_BINDING_MODE=enforce`.

Optional for multi-instance deployments:

```
REDIS_URL=redis://<host>:6379
```

## Swagger / OpenAPI

Swagger UI is available at:

- `GET /api-docs`
- `GET /api-docs.json`

For local development, the documented server defaults to `http://localhost:5000`.
For Render or another public deployment, set:

```
PUBLIC_API_URL=https://your-service.onrender.com
```

If `PUBLIC_API_URL` is empty, the backend also falls back to `RENDER_EXTERNAL_URL`
when Render provides it.

## Password Reset

Forgot-password flow:

- `POST /api/auth/forgot-password` with `{ "email": "user@example.com" }`
- backend generates a one-time reset token, stores only its SHA-256 hash, and emails a frontend reset link
- `POST /api/auth/reset-password` with `{ "token": "...", "password": "...", "confirmPassword": "..." }`
- token expires after 1 hour and is cleared after successful reset

Configure the frontend reset page URL and SMTP:

```
CLIENT_URL=http://localhost:5173
PASSWORD_RESET_URL=http://localhost:5173/reset-password
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
SMTP_SECURE=false
```

## Product Questions

Public product questions are available at `POST /api/product-questions`.
Admin management is available under `/api/admin/product-questions`.

Reply emails use SMTP only when these variables are configured:

```
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
SMTP_SECURE=false
```

If SMTP is not configured or an email send fails, the admin reply is still saved and
the response includes `email.sent: false`.

See `docs/product-questions.md` for payload examples.

## Live Voice Chat (MVP backend)

Added endpoint:

- `POST /api/chat/live/turn` (auth required)
  - multipart field: `audio` (optional if `transcript` provided)
  - optional body: `text`, `transcript`, `language`, `mode`, `conversationId`
  - `POST /api/chat/text/turn` is a typed-input alias that accepts the same turn payload without audio
  - returns both persisted messages in the same conversation thread:
    - recognized user message (`meta.type = "voice"` for audio turns or `meta.type = "text"` for typed turns, with matching `meta.mode`)
    - assistant reply message (same conversation)
    - when the reply matches catalog products, `products[]` and `assistantMessage.meta.productCards[]`
    - for voice turns, `tts.text` and `assistantMessage.meta.speechText` are short speakable summaries; `assistantMessage.text` keeps the full display reply
  - emits Socket.IO status event `chat:live:status` with states:
    - `processing`
    - `speaking`
    - `idle`

This does not create a separate chat history; it appends to existing `Message` history.
