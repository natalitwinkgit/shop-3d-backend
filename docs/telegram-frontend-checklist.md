# Frontend Checklist: Telegram bot integration

Цей чекліст для фронта сайту меблевого магазину. Backend Telegram microservice живе окремо, а frontend має працювати тільки через основний backend сайту. Не викликати `telegram-bot-service` напряму з браузера, бо там internal API key.

## Що додати в профіль користувача

1. Додати блок `Telegram` у налаштування профілю.
2. Показувати статус:
   - `Telegram не підключено`
   - `Telegram підключено`
   - `Telegram заблокований або недоступний`, якщо backend поверне такий статус
3. Додати кнопку `Підключити Telegram`.
4. Після кліку викликати backend endpoint сайту для створення bind request.
5. Показати користувачу:
   - одноразовий код привʼязки
   - TTL коду
   - кнопку `Відкрити Telegram`
   - fallback-інструкцію: “Відкрийте @mebli_hub_service_bot і введіть код”
6. Запустити polling статусу bind request кожні 2-3 секунди.
7. Якщо статус `confirmed`, оновити UI на `Telegram підключено`.
8. Якщо статус `expired`, показати кнопку `Створити новий код`.
9. Якщо статус `cancelled` або помилка, показати зрозуміле повідомлення.
10. Додати кнопку `Відвʼязати Telegram`.
11. Після відвʼязки очистити локальний стан і показати `Telegram не підключено`.

## UI для привʼязки Telegram

Потрібні стани:

- `idle` - статус ще не завантажено
- `not_linked` - Telegram не підключено
- `creating` - створюється код
- `pending` - код створено, чекаємо підтвердження в боті
- `confirmed` - Telegram підключено
- `expired` - код прострочено
- `error` - помилка

Приклад UI copy:

```text
Підключіть Telegram, щоб отримувати статуси замовлень, акції та швидко входити на сайт.
```

```text
Ваш код: 482913
Він дійсний 10 хвилин.
Відкрийте @mebli_hub_service_bot і підтвердьте привʼязку.
```

## Frontend endpoints через основний backend

Фронт має працювати з такими endpoint-ами основного backend. Якщо їх ще немає, додати на backend як proxy до Telegram microservice.

```http
GET /api/account/telegram
POST /api/account/telegram/bind-request
GET /api/account/telegram/bind-request/:requestId
DELETE /api/account/telegram
PATCH /api/account/telegram/notifications
```

Очікуваний response для статусу:

```json
{
  "linked": true,
  "binding": {
    "username": "mebli_user",
    "firstName": "Ivan",
    "linkedAt": "2026-04-18T18:08:10.000Z",
    "notificationPreferences": {
      "orderStatus": true,
      "promotions": true,
      "personalDiscounts": true,
      "abandonedCart": true,
      "backInStock": true,
      "priceDrop": true,
      "unfinishedOrder": true,
      "service": true
    }
  }
}
```

Очікуваний response для створення коду:

```json
{
  "id": "681111111111111111111111",
  "status": "pending",
  "code": "482913",
  "deepLink": "https://t.me/mebli_hub_service_bot?start=482913",
  "expiresAt": "2026-04-18T18:15:00.000Z",
  "ttlSeconds": 600
}
```

## Що додати на сторінку логіну

1. Додати кнопку `Увійти через Telegram`.
2. Перед login request користувач має ввести email або телефон, щоб backend знайшов акаунт.
3. Після кліку викликати backend endpoint сайту:

```http
POST /api/auth/telegram/login-request
```

Request:

```json
{
  "login": "ivan@example.com"
}
```

4. Якщо Telegram не привʼязаний, показати:

```text
Telegram ще не підключено до цього акаунта. Увійдіть звичайним способом і підключіть Telegram у профілі.
```

5. Якщо request створено, показати екран очікування:

```text
Ми надіслали запит у Telegram. Натисніть “Підтвердити вхід” у боті.
```

6. Polling кожні 2-3 секунди:

```http
GET /api/auth/telegram/login-request/:requestId
```

7. Якщо статус `confirmed`, викликати redeem endpoint:

```http
POST /api/auth/telegram/login-request/:requestId/redeem
```

8. Після успішного redeem зберегти auth token/session так само, як після звичайного login.
9. Якщо статус `expired`, показати кнопку `Надіслати ще раз`.
10. Якщо request уже `redeemed`, не повторювати авторизацію.

## Що додати на сторінку “Забули пароль”

1. У flow відновлення пароля додати вибір способу:
   - Email
   - Telegram
2. Telegram-спосіб доступний тільки якщо акаунт має привʼязаний Telegram.
3. Користувач вводить email або телефон.
4. Frontend викликає:

```http
POST /api/auth/telegram/recovery-request
```

Request:

```json
{
  "login": "ivan@example.com"
}
```

5. Показати екран очікування:

```text
Ми надіслали запит на відновлення доступу в Telegram.
Підтвердьте його в @mebli_hub_service_bot.
```

6. Polling:

```http
GET /api/auth/telegram/recovery-request/:requestId
```

7. Якщо статус `confirmed`, викликати:

```http
POST /api/auth/telegram/recovery-request/:requestId/redeem
```

8. Backend має повернути password reset token або redirect URL для форми нового пароля.
9. Відкрити форму нового пароля.
10. Якщо Telegram не привʼязаний, показати email recovery як fallback.

## Налаштування сповіщень у профілі

Додати чекбокси або switches:

- Статуси замовлень
- Акції
- Персональні знижки
- Покинуті кошики
- Надходження товару в наявність
- Зміна ціни на вибраний товар
- Нагадування про незавершене замовлення
- Сервісні повідомлення

Зберігати через:

```http
PATCH /api/account/telegram/notifications
```

Request:

```json
{
  "preferences": {
    "orderStatus": true,
    "promotions": false,
    "personalDiscounts": true,
    "abandonedCart": true,
    "backInStock": true,
    "priceDrop": true,
    "unfinishedOrder": true,
    "service": true
  }
}
```

## Кабінет у Telegram web/profile UI

У профілі сайту можна додати короткий preview, що доступно в боті:

- Дисконтна картка
- Останні замовлення
- Обране
- Сповіщення
- Вхід через Telegram
- Відновлення доступу через Telegram

Кнопка:

```text
Відкрити Telegram-бота
```

URL:

```text
https://t.me/mebli_hub_service_bot
```

## Edge cases для фронта

- Код прострочено: показати `Створити новий код`.
- Код уже використано: оновити статус привʼязки.
- Telegram не привʼязаний при login/recovery: показати fallback email/password.
- Користувач заблокував бота: показати “Відкрийте Telegram і розблокуйте бота”.
- Користувач натиснув login через Telegram кілька разів: скасувати старий polling і відстежувати останній request.
- Вкладка закрита під час pending: при поверненні перечитати статус.
- Немає `deepLink`: показати ручну інструкцію з кодом.
- 429/rate limit: показати таймер і не спамити повторними запитами.
- 401 на frontend proxy: перелогінити користувача або показати auth error.

## Frontend prompt

```text
Потрібно інтегрувати Telegram bot flow для MebliHub frontend.

Бот: @mebli_hub_service_bot

Зроби зміни:

1. У профілі користувача додай блок Telegram:
   - статус підключення;
   - кнопка “Підключити Telegram”;
   - показ одноразового коду;
   - кнопка deep link “Відкрити Telegram”;
   - polling статусу привʼязки;
   - кнопка “Відвʼязати Telegram”;
   - налаштування типів сповіщень.

2. На сторінці логіну додай “Увійти через Telegram”:
   - користувач вводить email/phone;
   - створюється login request;
   - показується екран очікування підтвердження в Telegram;
   - після confirmed робиться redeem і користувач авторизується.

3. На сторінці “Забули пароль” додай спосіб “Telegram”:
   - користувач вводить email/phone;
   - створюється recovery request;
   - користувач підтверджує запит у боті;
   - після redeem відкривається форма нового пароля.

4. Додай frontend API layer для:
   - GET /api/account/telegram
   - POST /api/account/telegram/bind-request
   - GET /api/account/telegram/bind-request/:requestId
   - DELETE /api/account/telegram
   - PATCH /api/account/telegram/notifications
   - POST /api/auth/telegram/login-request
   - GET /api/auth/telegram/login-request/:requestId
   - POST /api/auth/telegram/login-request/:requestId/redeem
   - POST /api/auth/telegram/recovery-request
   - GET /api/auth/telegram/recovery-request/:requestId
   - POST /api/auth/telegram/recovery-request/:requestId/redeem

5. Оброби edge cases:
   - expired request;
   - Telegram не привʼязаний;
   - rate limit;
   - повторний клік;
   - користувач заблокував бота;
   - backend недоступний.

6. UI copy українською.

7. Після реалізації:
   - запусти lint/build/test, які є в frontend repo;
   - зроби окремі коміти по логічних частинах;
   - запуш зміни в окрему гілку;
   - в фінальному повідомленні напиши branch, commits і перевірки.
```
