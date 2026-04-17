# Password Reset

## Backend Flow

1. Frontend sends `POST /api/auth/forgot-password` with user email.
2. Backend normalizes the email and always returns the same public response.
3. If the account exists and is active, backend creates a random one-time token.
4. Backend stores only `sha256(token)` in MongoDB with a 1 hour expiration.
5. Backend sends an email with `PASSWORD_RESET_URL?token=<token>`.
6. User opens the frontend reset page, enters password twice.
7. Frontend sends `POST /api/auth/reset-password`.
8. Backend validates token, checks expiration, hashes the new password, clears reset fields, and sets `lastLogoutAt` to revoke old sessions.

## Env

```env
CLIENT_URL=http://localhost:5173
PASSWORD_RESET_URL=http://localhost:5173/reset-password
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
SMTP_SECURE=false
```

`PASSWORD_RESET_URL` should point to the frontend page where the user enters the new password.

## API

### Request Reset

`POST /api/auth/forgot-password`

```json
{
  "email": "user@example.com"
}
```

Response:

```json
{
  "ok": true,
  "message": "If the account exists, reset instructions will be sent"
}
```

### Set New Password

`POST /api/auth/reset-password`

```json
{
  "token": "token-from-email-link",
  "password": "new-secret123",
  "confirmPassword": "new-secret123"
}
```

Success:

```json
{
  "ok": true,
  "message": "Password has been reset"
}
```

Invalid or expired token returns `400`.
