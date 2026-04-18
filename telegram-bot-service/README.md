# Telegram Bot Microservice

Окремий Node.js + Express мікросервіс для Telegram-бота меблевого e-commerce. Сервіс не вбудований в основний backend: він має власний HTTP app, Mongo collections, Telegram Bot API integration, internal REST API і власну логіку безпечної привʼязки, входу та recovery.

## Запуск

```bash
cp telegram-bot-service/.env.example .env.telegram
npm run telegram:service
```

Сервіс читає env зі стандартного `.env`. Якщо потрібен окремий env-файл, запускайте процес із попереднім завантаженням env у вашому process manager.

## Структура

```text
telegram-bot-service/
  app.js
  index.js
  polling.js
  config/
  controllers/
  integrations/
  middlewares/
  models/
  routes/
  services/
  utils/
```

## MongoDB collections

### `telegram_bindings`

Привʼязка Telegram до акаунта сайту.

```js
{
  websiteUserId: String,       // id користувача в основному backend
  telegramUserId: String,      // Telegram from.id
  chatId: String,
  username: String,
  firstName: String,
  lastName: String,
  languageCode: String,
  status: "active" | "unlinked" | "blocked",
  userPreview: {
    email: String,
    phone: String,
    name: String
  },
  notificationPreferences: {
    orderStatus: Boolean,
    promotions: Boolean,
    personalDiscounts: Boolean,
    abandonedCart: Boolean,
    backInStock: Boolean,
    priceDrop: Boolean,
    unfinishedOrder: Boolean,
    service: Boolean
  },
  linkedAt: Date,
  unlinkedAt: Date,
  blockedAt: Date,
  lastSeenAt: Date
}
```

Partial unique indexes for `status: "active"`:

- `websiteUserId`
- `telegramUserId`

Це блокує неявну active-привʼязку одного Telegram до кількох акаунтів і одного акаунта до кількох Telegram, але дозволяє повторну привʼязку після `/unlink`.

### `telegram_auth_requests`

Одноразові bind/login/recovery requests.

```js
{
  kind: "bind" | "login" | "recovery",
  websiteUserId: String,
  requestTokenHash: String,
  codeHash: String,
  telegramUserId: String,
  chatId: String,
  status: "pending" | "confirmed" | "redeemed" | "expired" | "cancelled",
  attemptCount: Number,
  maxAttempts: Number,
  expiresAt: Date,
  confirmedAt: Date,
  redeemedAt: Date,
  metadata: Object
}
```

Коди й request tokens не зберігаються у відкритому вигляді. Зберігається HMAC-SHA256 hash з `TELEGRAM_TOKEN_PEPPER`.

### `telegram_audit_logs`

Аудит привʼязок, login/recovery, помилок і відхилених операцій.

### `telegram_notification_logs`

Лог доставки або пропуску сповіщень.

## Internal API

Усі `/internal/*` endpoints захищені:

```http
X-Internal-Api-Key: <TELEGRAM_INTERNAL_API_KEY>
```

Також для bind/login/recovery статусу й redeem використовується короткоживучий `requestToken`.

### Binding

#### Create bind request

```http
POST /internal/bind-requests
Content-Type: application/json
X-Internal-Api-Key: ...
```

Request:

```json
{
  "websiteUserId": "6801d7c7c21d5b65bbf54001",
  "userPreview": {
    "name": "Іван Петренко",
    "email": "ivan@example.com",
    "phone": "+380501112233"
  },
  "metadata": {
    "source": "profile-settings"
  }
}
```

Response:

```json
{
  "id": "681111111111111111111111",
  "kind": "bind",
  "websiteUserId": "6801d7c7c21d5b65bbf54001",
  "status": "pending",
  "expiresAt": "2026-04-18T18:15:00.000Z",
  "code": "482913",
  "requestToken": "short-lived-request-token",
  "deepLink": "https://t.me/your_shop_bot?start=482913",
  "ttlSeconds": 600
}
```

Frontend може показати код і кнопку переходу в Telegram по `deepLink`.

#### Check bind status

```http
GET /internal/bind-requests/:requestId
X-Internal-Api-Key: ...
X-Telegram-Request-Token: <requestToken>
```

Response:

```json
{
  "id": "681111111111111111111111",
  "kind": "bind",
  "websiteUserId": "6801d7c7c21d5b65bbf54001",
  "status": "confirmed",
  "expiresAt": "2026-04-18T18:15:00.000Z",
  "confirmedAt": "2026-04-18T18:08:10.000Z",
  "redeemedAt": null
}
```

#### Check current binding

```http
GET /internal/bindings/by-user/:websiteUserId
```

Response:

```json
{
  "linked": true,
  "binding": {
    "websiteUserId": "6801d7c7c21d5b65bbf54001",
    "telegramUserId": "123456789",
    "username": "customer",
    "firstName": "Ivan",
    "lastName": "Petrenko",
    "linkedAt": "2026-04-18T18:08:10.000Z",
    "notificationPreferences": {
      "orderStatus": true,
      "promotions": true
    }
  }
}
```

#### Unlink

```http
DELETE /internal/bindings/by-user/:websiteUserId
```

### Login через Telegram

#### Create login request

Основний backend має спочатку ідентифікувати користувача за email/phone/login form і передати `websiteUserId`.

```http
POST /internal/login-requests
```

Request:

```json
{
  "websiteUserId": "6801d7c7c21d5b65bbf54001",
  "metadata": {
    "ip": "203.0.113.10",
    "userAgent": "browser"
  }
}
```

Response:

```json
{
  "id": "681222222222222222222222",
  "kind": "login",
  "websiteUserId": "6801d7c7c21d5b65bbf54001",
  "status": "pending",
  "expiresAt": "2026-04-18T18:20:00.000Z",
  "requestToken": "short-lived-request-token",
  "ttlSeconds": 300
}
```

Бот надсилає користувачу inline-кнопку “Підтвердити вхід”.

#### Poll login status

```http
GET /internal/login-requests/:requestId
X-Telegram-Request-Token: <requestToken>
```

#### Redeem confirmed login

```http
POST /internal/login-requests/:requestId/redeem
X-Telegram-Request-Token: <requestToken>
```

Response:

```json
{
  "id": "681222222222222222222222",
  "kind": "login",
  "websiteUserId": "6801d7c7c21d5b65bbf54001",
  "status": "redeemed",
  "confirmedAt": "2026-04-18T18:16:25.000Z",
  "redeemedAt": "2026-04-18T18:16:28.000Z"
}
```

Після `redeem` основний backend випускає свій application JWT/session cookie.

### Recovery через Telegram

#### Create recovery request

```http
POST /internal/recovery-requests
```

Request:

```json
{
  "websiteUserId": "6801d7c7c21d5b65bbf54001",
  "metadata": {
    "reason": "password-reset"
  }
}
```

#### Poll recovery status

```http
GET /internal/recovery-requests/:requestId
X-Telegram-Request-Token: <requestToken>
```

#### Redeem recovery

```http
POST /internal/recovery-requests/:requestId/redeem
X-Telegram-Request-Token: <requestToken>
```

Після `redeem` основний backend генерує власний password reset token і показує форму нового пароля.

### Notifications

#### Order status

```http
POST /internal/notifications/order-status
```

Request:

```json
{
  "websiteUserId": "6801d7c7c21d5b65bbf54001",
  "orderId": "ORD_ID",
  "orderNumber": "10042",
  "status": "shipped",
  "total": "12400 грн",
  "url": "https://shop.example.com/account/orders/ORD_ID"
}
```

Supported order statuses:

- `processing` - в обробці
- `confirmed` - підтверджено
- `shipped` - відправлено
- `delivered` - доставлено
- `cancelled` - скасовано

#### Generic event

```http
POST /internal/notifications/event
```

Request:

```json
{
  "websiteUserId": "6801d7c7c21d5b65bbf54001",
  "type": "priceDrop",
  "title": "Ціна змінилась",
  "message": "Шафа BRW тепер дешевша на 12%.",
  "url": "https://shop.example.com/products/brw-wardrobe",
  "payload": {
    "productId": "PRODUCT_ID"
  }
}
```

Supported notification types:

- `orderStatus`
- `promotions`
- `personalDiscounts`
- `abandonedCart`
- `backInStock`
- `priceDrop`
- `unfinishedOrder`
- `service`

#### Campaign

```http
POST /internal/notifications/campaign
```

Request:

```json
{
  "websiteUserIds": ["6801d7c7c21d5b65bbf54001"],
  "type": "promotions",
  "title": "Акція на меблі для спальні",
  "message": "До -20% на вибрані позиції.",
  "url": "https://shop.example.com/sale"
}
```

Якщо `websiteUserIds` порожній, сервіс надішле кампанію всім active bindings з увімкненим типом notification.

## Telegram commands

- `/start` - старт, перевірка привʼязки або прийом deep-link коду
- `/help` - список можливостей
- `/profile` - коротка інформація про користувача
- `/orders` - останні замовлення
- `/discount` - дисконтна картка
- `/favorites` - обране
- `/notifications` - налаштування сповіщень
- `/login` - пояснення входу через Telegram
- `/unlink` - відвʼязати Telegram

Inline-кнопки:

- “Мої замовлення”
- “Моя знижка”
- “Обране”
- “Налаштування сповіщень”
- “Підтвердити вхід”
- “Відкрити сайт”

## Main backend endpoints, які має надати сайт для Telegram-кабінету

Бот викликає `WEBSITE_INTERNAL_API_URL` з `X-Internal-Api-Key: WEBSITE_INTERNAL_API_KEY`.

Очікувані endpoints в основному backend:

```http
GET /api/internal/telegram/users/:websiteUserId/profile
GET /api/internal/telegram/users/:websiteUserId/orders
GET /api/internal/telegram/users/:websiteUserId/discount
GET /api/internal/telegram/users/:websiteUserId/favorites
```

Приклад profile response:

```json
{
  "profile": {
    "name": "Іван Петренко",
    "email": "ivan@example.com",
    "phone": "+380501112233",
    "discountPercent": 7
  }
}
```

Приклад orders response:

```json
{
  "orders": [
    {
      "id": "ORDER_ID",
      "number": "10042",
      "status": "shipped",
      "createdAt": "2026-04-18T17:00:00.000Z",
      "total": "12400 грн",
      "items": [
        { "name": "Шафа BRW" },
        { "name": "Комод" }
      ]
    }
  ]
}
```

Приклад discount response:

```json
{
  "discount": {
    "cardNumber": "DC-000102",
    "percent": 7,
    "qrUrl": "https://shop.example.com/account/discount/qr",
    "history": [
      { "date": "2026-04-10", "orderNumber": "10040", "amount": "520 грн" }
    ]
  }
}
```

Приклад favorites response:

```json
{
  "favorites": [
    {
      "id": "PRODUCT_ID",
      "name": "Ліжко з підйомним механізмом",
      "url": "https://shop.example.com/products/bed"
    }
  ]
}
```

## Frontend flow

### Підключити Telegram

1. Користувач авторизований на сайті.
2. У профілі натискає “Підключити Telegram”.
3. Frontend викликає основний backend: `POST /api/account/telegram/bind-request`.
4. Основний backend server-side викликає Telegram microservice: `POST /internal/bind-requests`.
5. Frontend показує код `code` і кнопку `deepLink`.
6. Користувач відкриває Telegram-бота через deep link або вводить код вручну.
7. Бот підтверджує код, створює `telegram_bindings`.
8. Frontend polling-ом перевіряє bind status через основний backend.
9. Коли status `confirmed`, UI показує “Telegram підключено”.

### Увійти через Telegram

1. На login screen користувач вводить email/phone.
2. Frontend вибирає “Увійти через код у Telegram”.
3. Основний backend знаходить користувача і викликає `POST /internal/login-requests`.
4. Бот надсилає inline-кнопку “Підтвердити вхід”.
5. Frontend показує екран очікування і polling-ом питає статус у backend.
6. Користувач натискає кнопку в Telegram.
7. Основний backend робить `POST /internal/login-requests/:id/redeem`.
8. Якщо успішно, основний backend випускає application JWT/session cookie.

### Відновити пароль через Telegram

1. Користувач вибирає “Відновити пароль”.
2. Вводить email/phone.
3. Вибирає спосіб “Telegram”.
4. Основний backend викликає `POST /internal/recovery-requests`.
5. Бот надсилає inline-кнопку підтвердження.
6. Після підтвердження основний backend робить `redeem`.
7. Основний backend генерує власний password reset token і відкриває форму нового пароля.

## Приклади Telegram-повідомлень

Binding:

```text
Telegram успішно підключено до акаунта. Тепер ви можете отримувати сповіщення і користуватися кабінетом у боті.
```

Login:

```text
Хтось намагається увійти у ваш акаунт меблевого магазину через Telegram.

Якщо це ви, натисніть кнопку нижче.
[Підтвердити вхід]
```

Order status:

```text
Оновлення замовлення
Замовлення: 10042
Статус: відправлено
Сума: 12400 грн
```

Promotion:

```text
Акція на меблі для спальні
До -20% на вибрані позиції.
[Відкрити сайт]
```

## Edge cases

- Прострочений bind/login/recovery request переходить у `expired`.
- Невалідний bind code повертає повідомлення в боті без розкриття деталей.
- Повторне використання login/recovery після `redeemed` блокується.
- Telegram не привʼязаний: login/recovery creation повертає `TELEGRAM_NOT_LINKED`.
- Telegram уже привʼязаний до іншого акаунта: bind повертає `TELEGRAM_ALREADY_BOUND`.
- Website account уже має інший Telegram: bind повертає `WEBSITE_USER_ALREADY_BOUND`.
- Якщо користувач заблокував бота, delivery падає, binding переводиться в `blocked` для notification flow.
- Sensitive endpoints мають rate limiting, requestToken і короткий TTL.
- Коди й токени не зберігаються plaintext.

## Production notes

- У production використовуйте webhook (`TELEGRAM_PUBLIC_WEBHOOK_URL`) замість polling.
- `TELEGRAM_INTERNAL_API_KEY`, `WEBSITE_INTERNAL_API_KEY`, `TELEGRAM_TOKEN_PEPPER` мають бути довгими random secrets.
- Основний backend не повинен видавати application JWT тільки на основі `pending`; потрібен `confirmed` + `redeem`.
- Для login/recovery frontend краще polling робити через основний backend, а не напряму в Telegram microservice.
- Для campaign notification варто додати queue/message broker, якщо обсяг користувачів великий.
