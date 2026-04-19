# Frontend Checklist: Telegram у профілі користувача

Цей чекліст для frontend частини профілю користувача MebliHub. Frontend працює тільки з основним backend сайту. Не викликати `telegram-bot-service` напряму з браузера.

## Ціль

Користувач у профілі сайту бачить блок `Telegram`, може відкрити бота, натиснути `/start`, поділитися своїм номером телефону, і бот привʼязує цей Telegram до акаунта сайту з таким самим номером.

Основний сценарій:

1. Користувач залогінений на сайті.
2. Відкриває `Профіль` або `Налаштування акаунта`.
3. Бачить блок `Telegram`.
4. Натискає `Відкрити Telegram-бота`.
5. У Telegram натискає `/start`.
6. Бот просить натиснути `Поділитися номером`.
7. Telegram відправляє contact з телефоном.
8. Backend знаходить акаунт сайту за цим телефоном.
9. Telegram привʼязується до акаунта.
10. Frontend оновлює статус на `Telegram підключено`.

## Що додати в профіль

Додати окремий блок `Telegram` у налаштування акаунта.

Показувати стани:

- `loading` - статус завантажується.
- `not_linked` - Telegram не підключено.
- `linked` - Telegram підключено.
- `blocked` - бот заблокований або недоступний.
- `error` - не вдалося отримати статус.

Для `not_linked` показати:

```text
Telegram не підключено
Підключіть Telegram, щоб отримувати статуси замовлень, акції та швидко відкривати дані акаунта в боті.
```

Кнопки:

- `Відкрити Telegram-бота`
- `Я вже поділився номером`

Для `linked` показати:

```text
Telegram підключено
```

Якщо backend повертає дані Telegram-профілю, показати:

- username
- firstName
- linkedAt
- стан сповіщень

Кнопки:

- `Відкрити Telegram-бота`
- `Відвʼязати Telegram`

## URL бота

Кнопка `Відкрити Telegram-бота` відкриває:

```text
https://t.me/mebli_hub_service_bot
```

Не потрібно відкривати сайт із бота для привʼязки. Новий fallback-flow працює через `/start` і кнопку `Поділитися номером` у самому Telegram.

## API для статусу

При відкритті профілю frontend викликає:

```http
GET /api/account/telegram
```

Очікуваний response, якщо Telegram не підключено:

```json
{
  "linked": false,
  "binding": null
}
```

Очікуваний response, якщо Telegram підключено:

```json
{
  "linked": true,
  "binding": {
    "websiteUserId": "681111111111111111111111",
    "telegramUserId": "123456789",
    "username": "mebli_user",
    "firstName": "Ivan",
    "lastName": "Petrenko",
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

## Polling після відкриття бота

Після кліку `Відкрити Telegram-бота` frontend має запустити короткий polling статусу:

```http
GET /api/account/telegram
```

Рекомендовано:

- polling кожні 2-3 секунди;
- тривалість 2 хвилини;
- зупинити polling, якщо `linked: true`;
- зупинити polling, якщо користувач закрив блок або перейшов зі сторінки;
- при поверненні на вкладку перечитати статус один раз.

Поки polling активний, показати текст:

```text
Відкрийте бота, натисніть /start і поділіться номером телефону. Після підтвердження статус оновиться автоматично.
```

Кнопка:

```text
Перевірити статус
```

Вона вручну викликає `GET /api/account/telegram`.

## Відвʼязати Telegram

Для `linked` стану додати кнопку:

```text
Відвʼязати Telegram
```

При кліку показати confirm:

```text
Відвʼязати Telegram від акаунта?
Ви більше не отримуватимете сповіщення в боті.
```

Після підтвердження викликати:

```http
DELETE /api/account/telegram
```

Після успіху:

- очистити локальний Telegram state;
- показати `Telegram не підключено`;
- зупинити всі polling timers.

## Налаштування сповіщень

Якщо Telegram підключено, показати switches:

- `Статуси замовлень`
- `Акції`
- `Персональні знижки`
- `Покинуті кошики`
- `Наявність товару`
- `Зміна ціни`
- `Незавершене замовлення`
- `Сервісні повідомлення`

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

Після успіху оновити локальний state з response.

## UI copy

Для непривʼязаного акаунта:

```text
Підключіть Telegram
Отримуйте статуси замовлень, акції та швидкий доступ до акаунта в боті.
```

Інструкція:

```text
1. Натисніть “Відкрити Telegram-бота”.
2. У боті натисніть /start.
3. Натисніть “Поділитися номером”.
4. Поверніться сюди, статус оновиться автоматично.
```

Якщо номер у Telegram не збігається з номером акаунта:

```text
Не вдалося привʼязати Telegram. Перевірте, що номер телефону в акаунті збігається з номером Telegram.
```

Якщо backend недоступний:

```text
Не вдалося перевірити Telegram. Спробуйте ще раз.
```

Якщо Telegram вже підключено:

```text
Telegram підключено
```

## Важливі правила для frontend

- Не викликати `telegram-bot-service` напряму.
- Не передавати `TELEGRAM_INTERNAL_API_KEY` або `WEBSITE_INTERNAL_API_KEY` у frontend.
- Не зберігати Telegram `telegramUserId` у localStorage як джерело істини.
- Джерело істини для статусу тільки `GET /api/account/telegram`.
- Не вважати клік `Відкрити Telegram-бота` успішною привʼязкою.
- Не показувати `Telegram підключено`, поки backend не повернув `linked: true`.
- Якщо користувач змінив номер телефону в профілі, перечитати Telegram status.
- Якщо користувач натискає кнопку багато разів, не запускати кілька polling intervals одночасно.

## Edge cases

- Користувач відкрив бота, але не натиснув `/start`: лишити `not_linked`, показати інструкцію.
- Користувач натиснув `/start`, але не поділився номером: лишити `not_linked`.
- Користувач поділився чужим контактом: бот відхилить, frontend просто продовжує polling.
- Номер Telegram не знайдено серед акаунтів сайту: показати інструкцію перевірити телефон у профілі.
- Акаунт уже має інший Telegram: показати помилку після ручної перевірки статусу.
- Telegram уже привʼязаний до іншого акаунта: показати помилку після ручної перевірки статусу.
- Backend повернув 401: перелогінити користувача або показати auth error.
- Backend повернув 429: зупинити частий polling і показати `Спробуйте за хвилину`.
- Користувач закрив вкладку під час привʼязки: при наступному відкритті профілю знову викликати `GET /api/account/telegram`.

## Acceptance checklist

- У профілі є блок `Telegram`.
- При завантаженні профілю викликається `GET /api/account/telegram`.
- Для `not_linked` є кнопка `Відкрити Telegram-бота`.
- Кнопка відкриває `https://t.me/mebli_hub_service_bot`.
- Після відкриття бота запускається polling `GET /api/account/telegram`.
- Коли користувач у боті натискає `/start` і `Поділитися номером`, frontend сам оновлює статус на `Telegram підключено`.
- Для `linked` є кнопка `Відвʼязати Telegram`.
- `DELETE /api/account/telegram` оновлює UI без reload.
- Налаштування сповіщень зберігаються через `PATCH /api/account/telegram/notifications`.
- Немає прямих запитів з браузера до `telegram-bot-service`.
- Немає internal API keys у frontend bundle.
- Polling не дублюється при повторних кліках.
- Помилки 401, 429, 5xx мають зрозумілий текст.

## Prompt для frontend розробника

```text
Потрібно додати Telegram-привʼязку в профіль користувача MebliHub.

Flow:
1. Користувач залогінений на сайті.
2. У профілі бачить блок Telegram.
3. Натискає “Відкрити Telegram-бота”.
4. У боті натискає /start.
5. Бот просить “Поділитися номером”.
6. Користувач ділиться номером.
7. Backend привʼязує Telegram до акаунта з таким самим телефоном.
8. Frontend polling-ом бачить linked: true і показує “Telegram підключено”.

Frontend має використовувати тільки основний backend:
- GET /api/account/telegram
- DELETE /api/account/telegram
- PATCH /api/account/telegram/notifications

Не викликати telegram-bot-service напряму.
Не додавати internal API keys у frontend.

Зробити:
- Telegram block у профілі.
- Стани loading / not_linked / linked / blocked / error.
- Кнопку “Відкрити Telegram-бота”.
- Polling статусу після відкриття бота.
- Кнопку “Перевірити статус”.
- Кнопку “Відвʼязати Telegram”.
- Switches для налаштувань сповіщень.
- Український UI copy.
- Обробку 401, 429, 5xx.

Після реалізації запустити frontend lint/build/test, які є в repo.
```
