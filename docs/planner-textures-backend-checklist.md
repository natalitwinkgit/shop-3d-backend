# Backend Checklist: planner textures

Фронт для планера має брати текстури не з локальних файлів, а з бекенду через БД. Сам файл текстури зберігається в Cloudinary, а в MongoDB тримається URL і метадані.

## Що потрібно зробити на бекенді

1. Додати окремі Mongo collections для кожного типу текстур.
2. Зробити публічний `GET /api/planner-textures`.
3. Додати адмінські routes для upload, create, update, disable, delete.
4. Підключити Cloudinary для зберігання texture image.
5. Віддавати фронту готовий URL текстури з БД.

## Мінімальний контракт для фронта

Публічний endpoint:

- `GET /api/planner-textures`
- `GET /api/planner-textures/grouped`
- `GET /api/planner-textures/surface/floor`
- `GET /api/planner-textures/surface/wall`
- `GET /api/planner-textures/surface/door`
- опціонально `GET /api/planner-textures?surfaceType=floor`
- опціонально `GET /api/planner-textures?surfaceType=door&modelId=...`

Мінімальний response:

```json
{
  "items": [
    {
      "id": "6801d7c7c21d5b65bbf54001",
      "name": {
        "uk": "Дуб світлий",
        "ua": "Дуб світлий",
        "en": "Light oak"
      },
      "translationKey": "planner.textures.floor.oak-light",
      "i18nKey": "planner.textures.floor.oak-light",
      "surfaceType": "floor",
      "textureUrl": "https://res.cloudinary.com/your-cloud/image/upload/v1/planner/floor/light-oak.jpg",
      "previewUrl": "https://res.cloudinary.com/your-cloud/image/upload/v1/planner/floor/light-oak-preview.jpg",
      "isSeamless": true,
      "repeat": {
        "x": 2,
        "y": 2
      },
      "sortOrder": 10,
      "isActive": true
    }
  ]
}
```

Фронт повинен читати:

- `surfaceType`: `floor | wall | door`
- `textureUrl`
- `previewUrl`
- `id`
- `translationKey` або alias `i18nKey` для UI-перекладів
- `name.uk` і `name.en`, старий alias `name.ua` лишається для сумісності

Для окремого розділення по поверхнях можна брати:

```json
{
  "surfaces": {
    "floor": [],
    "wall": [],
    "door": []
  }
}
```

## MongoDB модель і collections

Рекомендований файл:

- `models/PlannerTexture.js`

Фізичні collections:

- `planner_floor_textures` - текстури підлоги
- `planner_wall_textures` - текстури стін
- `planner_door_textures` - текстури дверей

Legacy collection:

- `plannertextures` - стара спільна collection, використовується тільки як джерело для міграції

Рекомендовані поля:

- `key` - технічний ключ, унікальний
- `slug` - публічний slug, унікальний
- `translationKey` - стабільний ключ перекладу, наприклад `planner.textures.floor.oak-light`
- `name.uk`
- `name.ua` - legacy alias для української
- `name.en`
- `surfaceType` - enum: `floor | wall | door`, має відповідати collection
- `textureUrl` - основний CDN URL
- `previewUrl` - превʼю для адмінки
- `cloudinaryPublicId`
- `mimeType`
- `width`
- `height`
- `isSeamless`
- `repeat.x`
- `repeat.y`
- `sortOrder`
- `isActive`
- `createdAt`
- `updatedAt`

Опціонально, якщо потрібні PBR-мапи:

- `normalMapUrl`
- `roughnessMapUrl`
- `aoMapUrl`
- `metalnessMapUrl`

## Індекси

Для кожної surface collection:

- `key` - unique у межах конкретної collection
- `slug` - unique у межах конкретної collection
- `translationKey` - unique sparse у межах конкретної collection
- `cloudinaryPublicId` - unique
- `isActive`
- `sortOrder`

## Що зберігати в Cloudinary

У Cloudinary треба зберігати самі картинки текстур. У MongoDB треба зберігати тільки посилання і службові дані.

Рекомендовані папки:

- `planner/floor`
- `planner/wall`
- `planner/door`

Для кожної текстури бажано мати:

- основний texture file
- thumbnail або preview
- `public_id`
- `secure_url`

## Які файли додати в цьому репозиторії

### Public API

- `models/PlannerTexture.js`
- `controllers/plannerTextureController.js`
- `routes/plannerTextureRoutes.js`

Підключення:

- у [app/registerApiRoutes.js](/c:/Users/Lenovo/shop-3d-backend/app/registerApiRoutes.js) додати `app.use("/api/planner-textures", plannerTextureRoutes);`

### Admin API

- `admin/routes/plannerTextures.routes.js`
- за потреби `admin/controllers/plannerTextures.controller.js`
- `services/plannerTextureUploadService.js`

Підключення:

- у [admin/admin.router.js](/c:/Users/Lenovo/shop-3d-backend/admin/admin.router.js) додати `router.use("/planner-textures", plannerTexturesRoutes);`

## Ендпоїнти

### Public

- `GET /api/planner-textures`
- `GET /api/planner-textures/grouped`
- `GET /api/planner-textures/surface/:surfaceType`
- `GET /api/planner-textures?surfaceType=floor`
- `GET /api/planner-textures/:id`

Правила:

- у публічний список віддавати тільки `isActive !== false`
- сортувати по `sortOrder`, потім по `key`

### Admin

- `POST /api/admin/planner-textures/upload`
- `POST /api/admin/planner-textures`
- `GET /api/admin/planner-textures/grouped`
- `GET /api/admin/planner-textures/surface/:surfaceType`
- `PATCH /api/admin/planner-textures/:id/texture`
- `PATCH /api/admin/planner-textures/:id`
- `PATCH /api/admin/planner-textures/:id/status`
- `DELETE /api/admin/planner-textures/:id`
- `GET /api/admin/planner-textures`

`PATCH /api/admin/planner-textures/:id/texture` потрібен, якщо треба оновлювати тільки файл текстури окремо від назви, `sortOrder`, `isActive` та інших полів.

## Правильний потік upload

1. Адмін надсилає image file.
2. Бек валідовує MIME type і розмір.
3. Бек завантажує файл у Cloudinary.
4. Cloudinary повертає `secure_url` і `public_id`.
5. Бек зберігає запис у collection за `surfaceType`.
6. Публічний `GET /api/planner-textures` віддає готові URL фронту.

## Міграція старої БД

Скрипт:

```bash
npm run planner-textures:migrate
```

Безпечна перевірка без запису:

```bash
npm run planner-textures:migrate -- --dry-run
```

Перенести і видалити перенесені записи зі старої `plannertextures`:

```bash
npm run planner-textures:migrate -- --delete-source
```

Заповнити `translationKey` і `name.uk` у вже перенесених target collections:

```bash
npm run planner-textures:migrate -- --backfill-targets
```

Міграція читає `surfaceType` у старій collection і переносить документ у відповідну нову collection.

## Mock дані для інтеграції

Заповнити БД mock-текстурами:

```bash
npm run planner-textures:seed
```

Очистити тільки mock-записи з ключем `mock-*` і заново записати seed:

```bash
npm run planner-textures:seed -- --clear-mock
```

Seed додає 12 записів:

- 4 записи в `planner_floor_textures`
- 4 записи в `planner_wall_textures`
- 4 записи в `planner_door_textures`

Mock-записи мають повний frontend contract: `id`, `key`, `slug`, `translationKey`, `i18nKey`, `name.uk`, `name.ua`, `name.en`, `surfaceType`, `textureUrl`, `previewUrl`, `repeat`, `sortOrder`, `isActive`.

## Frontend checklist

- Брати дані з `GET /api/planner-textures/grouped`, якщо UI має показати всі секції одразу.
- Для окремої секції використовувати `GET /api/planner-textures/surface/floor`, `/wall`, `/door`.
- У стані фронта тримати текстури розділено: `floor`, `wall`, `door`; не змішувати їх в один список для застосування.
- Для унікального ключа кешу використовувати `${surfaceType}:${id}` або `${surfaceType}:${slug}`.
- Для UI-перекладів використовувати `translationKey` або alias `i18nKey`.
- Для fallback-тексту показувати `name.uk`, потім `name.ua`, потім `name.en`.
- Для Three.js/рендера брати `textureUrl`; для карток/селекторів брати `previewUrl`.
- При застосуванні текстури перевіряти `surfaceType`: `floor` тільки на підлогу, `wall` тільки на стіни, `door` тільки на двері.
- Застосовувати `repeat.x` і `repeat.y` до texture repeat, якщо рендер підтримує tiling.
- Не показувати `isActive === false`; публічний endpoint уже фільтрує, але адмінка може бачити inactive.
- В адмінці при create/upload обовʼязково передавати `surfaceType`.
- В адмінці дозволити редагувати `translationKey`, але не міняти його без потреби, бо це стабільний ключ перекладу.

## Валідація на бекенді

- дозволені тільки `floor`, `wall`, `door`
- тільки image MIME types
- ліміт по розміру файлу
- `textureUrl` не може бути порожнім
- `name.uk` або `name.ua`, а також `name.en` мають бути заповнені
- `translationKey` генерується автоматично як `planner.textures.{surfaceType}.{key}`, але може бути переданий явно
- `repeat.x` і `repeat.y` мають бути числами більше 0
- `isActive=false` не має потрапляти в публічний список

## Якщо текстури залежать від конкретної 3D-моделі

Якщо не всі текстури доступні для всіх дверей або моделей, потрібна окрема звʼязка:

- `models/PlannerTextureLink.js`

Поля:

- `modelId`
- `textureId`
- `surfaceType`

Тоді можна робити фільтр:

- `GET /api/planner-textures?surfaceType=door&modelId=abc123`

Якщо таких обмежень немає, цей шар не потрібен.

## Що потрібно додати в конфіг

У проєкті ще немає Cloudinary SDK, тому мінімально треба:

- dependency: `cloudinary`
- env:
  - `CLOUDINARY_CLOUD_NAME`
  - `CLOUDINARY_API_KEY`
  - `CLOUDINARY_API_SECRET`

Окремий конфіг:

- `config/cloudinary.js`

## Мінімальний робочий варіант

Якщо потрібно запустити швидко без зайвої складності, достатньо:

- три collections: `planner_floor_textures`, `planner_wall_textures`, `planner_door_textures`
- поля: `name`, `surfaceType`, `textureUrl`, `previewUrl`, `cloudinaryPublicId`, `isActive`, `sortOrder`
- один публічний route `GET /api/planner-textures`
- один адмінський upload route

Цього вже вистачить, щоб фронт підвантажував текстури з бекенду по URL з бази без змішування типів у MongoDB.
