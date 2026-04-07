# Security Audit 2026-04-07

## Fixed

### 1. Unauthenticated Socket.IO chat access

Previous state:

- any client could connect to Socket.IO without a token
- any client could call `join` with arbitrary `userId`, `id`, or `roomId`
- any client could spoof `sender` and send messages on behalf of users or admins

Impact:

- unauthorized clients could subscribe to admin/user rooms
- admin chat traffic could be read in real time
- messages could be forged as if they were sent by an admin

Fix:

- Socket.IO now requires a valid JWT or guest chat token during handshake
- sockets auto-join only their own identity room
- arbitrary room joins are ignored
- non-admin sessions can only send messages to admin receivers
- sender id must match the authenticated socket session

Files:

- `sockets/chatSocket.js`
- `services/chatSessionService.js`

### 2. Public support admin identifier leak

Previous state:

- `GET /api/chat/admin-id`
- `GET /api/chat/support-admin`

were public and exposed support admin identifiers to anonymous clients.

Impact:

- the admin identifier was enough to target admin chat rooms in the old socket flow

Fix:

- both routes now require authenticated user access
- guests must create a signed guest chat session first

Files:

- `routes/chatRoutes.js`

### 3. Weak REST access control for support chat endpoints

Previous state:

- a logged-in non-admin user only needed to be one of the two ids in the URL
- the API did not enforce that the conversation was actually a support chat involving an admin

Fix:

- non-admin users can now access only conversations that include their own id and an admin id
- same rule is applied to both `/api/chat/*` and `/api/messages/*`

Files:

- `routes/chatRoutes.js`
- `routes/messageRoutes.js`
- `services/chatAccessService.js`

### 4. Missing brute-force protection on auth endpoints

Previous state:

- no request throttling on login/register/password-reset routes

Impact:

- easier password guessing, credential stuffing, and email probing

Fix:

- added in-memory rate limiting for:
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `POST /api/auth/forgot-password`
  - `POST /api/auth/reset-password`
  - `POST /api/chat/guest-session`

Files:

- `middleware/rateLimitMiddleware.js`
- `routes/authRoutes.js`
- `routes/chatRoutes.js`

### 5. Email enumeration in forgot password

Previous state:

- `forgot-password` returned `404 User not found`

Impact:

- attackers could verify which emails are registered

Fix:

- endpoint now always returns a generic success message

Files:

- `controllers/authController.js`

### 6. Public review API exposed reviewer emails

Previous state:

- public review endpoints populated `user` with `name` and `email`

Impact:

- any anonymous client could collect reviewer email addresses

Fix:

- public and write-review responses now expose reviewer `name` only
- review moderation now accepts both `admin` and `superadmin`

Files:

- `routes/reviewRoutes.js`

## Remaining risks to review next

### Public inventory exposure

`GET /api/inventory/product/:productId` exposes stock by location without auth. This may be intentional for storefront availability, but it is still an information disclosure decision and should be confirmed.

### Password reset is still a placeholder

`POST /api/auth/reset-password` is not a real reset flow yet. It is safer than before because rate limiting is now present, but the route still needs a proper token-based reset implementation.

### In-memory rate limiting is single-instance only

The new limiter works for one Node.js process. If the backend is scaled horizontally, move rate limiting to Redis or the edge layer.
