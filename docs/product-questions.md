# Product Questions

## Environment

Configure SMTP only when admin replies should be emailed to customers:

```env
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
SMTP_SECURE=false
```

`SMTP_FROM` is optional and falls back to `SMTP_USER`. Keep secrets in `.env`, not in source.

Public form anti-bot protection can be enabled with Cloudflare Turnstile:

```env
TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
TURNSTILE_MIN_SCORE=0
```

When `TURNSTILE_SECRET_KEY` is set, `POST /api/product-questions` requires a valid
`captchaToken`. If the secret is empty, Turnstile verification is skipped.

## Public API

`POST /api/product-questions`

```json
{
  "productId": "507f1f77bcf86cd799439011",
  "customer": {
    "name": "Ivan Petrenko",
    "email": "ivan@example.com",
    "phone": "+380501112233"
  },
  "message": "Чи доступний цей товар у сірому кольорі?",
  "source": "product_page",
  "captchaToken": "<turnstile-token>"
}
```

The backend validates and sanitizes the payload, checks that the product exists,
builds `productSnapshot` from the current product document, and records `userId`
when the request has a valid auth token.

The public route has a request rate limit and accepts optional honeypot fields:
`website`, `company`, or `honeypot`.

## Admin API

All admin endpoints require the existing admin auth middleware.

- `GET /api/admin/product-questions?page=1&limit=20&status=new&q=sku-or-email`
- `GET /api/admin/product-questions/:id`
- `POST /api/admin/product-questions/:id/reply`
- `PATCH /api/admin/product-questions/:id/status`
- `PATCH /api/admin/product-questions/:id/read`

Reply payload:

```json
{
  "message": "Так, ця модель доступна у сірому кольорі. Менеджер уточнить термін поставки.",
  "status": "answered"
}
```

Status payload:

```json
{ "status": "closed" }
```

Read-state payload:

```json
{ "isRead": true }
```

Allowed statuses: `new`, `answered`, `closed`, `spam`.
