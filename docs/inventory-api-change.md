Кратко — изменения в API inventory (апрель 2026)

Что изменено
- В ответах, где раньше в поле `location` возвращался объект с описанием локации, теперь `location` — это человекочитаемая метка (string).
- Полный объект локации по-прежнему доступен в `locationDetails` (и аналогично: `fromLocationDetails`, `toLocationDetails` для движений).
- Изменения применены к:
  - `services/productInventoryAvailabilityService.js` — product API (`/api/products` и связанные) теперь возвращают `location` (string) + `locationDetails`.
  - `controllers/inventoryController.js` — все публичные/админские endpoints, генерирующие строки inventory, теперь возвращают `location` как string и `locationDetails` с полным объектом.

Почему
- Была ошибка во фронтенде: "Objects are not valid as a React child" — причиной были вложенные объекты, напрямую вставляемые в JSX. Переход к строковой `location` устраняет проблему, при этом сохраняя доступ к полному объекту.

Что нужно фронтенду
- Для простого отображения названия локации используйте `row.location`.
  - Пример (React):
    ```jsx
    // row — элемент inventoryRows
    <div>{row.location}</div>
    ```
- Если нужны дополнительные поля (адрес, телефон, тип и т.п.), используйте `row.locationDetails`:
  ```jsx
  <div>
    <div>{row.location}</div>
    <div>{row.locationDetails.address}</div>
    <div>{row.locationDetails.phone}</div>
  </div>
  ```
- Для поиска/фильтрации на клиенте опирайтесь на верхнеуровневые поля, которые также присутствуют в строке: `city`, `cityKey`, `locationType`, `locationId`, `locationName`, `locationAddress`.

Совместимость
- API сохраняет отдельные поля (`city`, `cityLabel`, `locationName`, `locationAddress`, `locationId`) — большинство клиентов не должны ломаться.
- Если где-то фронтенд ожидает, что `location` — объект, нужно заменить использование на `locationDetails`.

Переход и тесты
- Сервер уже обновлён и перезапущен. Для локальной проверки можно выполнить:
  ```powershell
  npm run kill-port  # (убивает процессы на порту 5000)
  npx nodemon .\index.js
  ```
- Примеры endpoint-ответов:
  - `/api/products` — `availableLocations[].location` теперь строка, `availableLocations[].locationDetails` — объект.
  - `/api/inventory/product/:productId` — список строк inventory с тем же форматом.

Если нужно — могу:
- Обновить README/API docs с примерами запросов.
- Пройтись по конкретным компонентам фронтенда (при наличии репозитория) и предложить патчи.

Автор: автоматическая правка бэкенда (GitHub Copilot)
