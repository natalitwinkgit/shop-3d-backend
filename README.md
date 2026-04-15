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
