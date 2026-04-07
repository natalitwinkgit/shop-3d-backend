# Backend Architecture

## Target structure

```text
config/
  env.js               # environment bootstrap
  cors.js              # CORS policy and origin allowlist

app/
  createApp.js         # express app factory
  registerApiRoutes.js # central API mount table
  middleware/          # cross-cutting app middleware

bootstrap/
  startServer.js       # DB connection + runtime bootstrap

sockets/
  chatSocket.js        # socket.io wiring and chat events

routes/
  *.js                 # public compatibility entrypoints

admin/
  admin.router.js      # /api/admin composition root
  lib/                 # admin shared helpers
  routes/              # admin feature routers

controllers/
services/
models/
middleware/
  # domain logic and shared business/runtime layers
```

## Rules

1. `index.js` should only start the server, not configure the whole app.
2. Route registration should stay centralized in `app/registerApiRoutes.js`.
3. `admin` endpoints should be split by feature, not kept in one large router.
4. Shared request policies belong in `app/middleware` or `config`, not inside route files.
5. Business logic should continue moving from routes into `controllers` and `services` as the next cleanup step.

## Compatibility

- Public API prefixes are unchanged.
- `routes/adminRoutes.js` remains as a compatibility wrapper.
- `admin/routes/admin.index.js` remains as a compatibility wrapper.
