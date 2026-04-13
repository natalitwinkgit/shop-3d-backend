# Frontend API Reference

Updated: 2026-04-10
Source of truth: current mounted routes in `index.js` and route definitions in `routes/`.

## Base

- Local base URL: `http://localhost:5000`
- API prefix: `/api`
- Static files: `/uploads/...` remain for legacy/category assets, but product `previewImage` and `modelUrl` should use direct remote URLs (for example Cloudinary)
- Default auth header: `Authorization: Bearer <token>`
- Default content type for JSON routes: `Content-Type: application/json`
- Admin frontend should use the normalized admin namespace: `/api/admin/*`

## Common Notes

- `GET /api/health` -> `{ ok: true, ts }`
- Global error format usually looks like:

```json
{
  "message": "Error message",
  "path": "/api/..."
}
```

- `401` -> invalid or missing token
- `403` -> forbidden or banned user
- `404` -> entity/route not found
- `500` -> server error
- This repository does not contain a frontend state manager such as `Redux`.
- Frontend state should treat backend API responses as the source of truth; domain data is persisted in MongoDB and exposed through `/api/*`.
- In current docs, references to query/UI state mean local page state or URL state on the frontend, not a centralized store implemented in this repository.

## Public API

### Auth

- `POST /api/auth/register`
  - body:
  ```json
  {
    "name": "User Name",
    "email": "user@example.com",
    "phone": "+380991112233",
    "password": "secret123",
    "confirmPassword": "secret123"
  }
  ```
  - response: `{ user, token }`
  - role is always created as `user`

- `POST /api/auth/login`
  - body:
  ```json
  {
    "email": "user@example.com",
    "password": "secret123"
  }
  ```
  - response: `{ user, token }`

- `POST /api/auth/forgot-password`
  - body: `{ "email": "user@example.com" }`

- `POST /api/auth/reset-password`
  - placeholder route, currently returns success stub

### Products / Catalog

- `GET /api/products`
- `GET /api/products/filter`
  - product list/filter endpoint
  - frontend can pass query params used by catalog UI

- `GET /api/products/facets`
  - returns facet data for filters

- `GET /api/products/by-slug/:category/:subCategory/:slug`
- `GET /api/products/by-slug/:slug`
- `GET /api/products/:id`
- `POST /api/products`
- `PUT /api/products/:id`
- `PATCH /api/products/:id`
- `DELETE /api/products/:id`
  - `POST/PUT/PATCH/DELETE` require admin auth
  - `POST/PUT/PATCH` accept `application/json` or `multipart/form-data`
  - backend accepts ready-to-use URL strings for `previewImage`, `images`, and `modelUrl`; admin product routes also accept product image/model files
  - backend auto-generates `slug`, `typeKey`, and `sku` when they are omitted
  - standard physical sizes should be sent in `dimensions`
  - type-specific professional attributes should be sent in `specifications`
  - product images are limited to 10 URLs/files total, including the preview image
  - first image is the preview: send it as `previewImage` / `imageUrl`, or put it first in the `images` / `imageUrls` list
  - for gallery URLs, backend accepts `images`, `imageUrls`, `galleryUrls`, `photoUrls`, or numbered fields `imageUrl1` ... `imageUrl10`
  - URL lists can be sent as a JSON array, comma-separated string, or newline-separated string
  - file uploads can use `imageFiles` with up to 10 files; if using `previewImageFile` separately, keep gallery files to 9 so total product images stay <= 10
  - for 3D files, backend accepts both `modelUrl` and `model3dUrl`
  - request body supports either localized objects or simple strings for `name` / `description`
  - minimal body example:
  ```json
  {
    "name": "Nordic Lounge Chair",
    "description": "Soft armchair with 3D model",
    "category": "chairs",
    "subCategory": "soft",
    "price": 12999,
    "dimensions": {
      "widthCm": 84,
      "lengthCm": 86,
      "heightCm": 92
    },
    "specifications": {
      "seats": 1,
      "material": "material_object_id",
      "manufacturer": "manufacturer_object_id"
    },
    "previewImage": "https://res.cloudinary.com/your-cloud/image/upload/v1/products/chair-preview.jpg",
    "images": [
      "https://res.cloudinary.com/your-cloud/image/upload/v1/products/chair-preview.jpg",
      "https://res.cloudinary.com/your-cloud/image/upload/v1/products/chair-side.jpg"
    ],
    "modelUrl": "https://res.cloudinary.com/your-cloud/raw/upload/v1/products/chair.glb"
  }
  ```
  - product responses include `_id`, `name`, `description`, `price`, `previewImage`, `modelUrl`, `colorKeys`, and optional hydrated `colors`
  - product responses hydrate `specifications.material` and `specifications.manufacturer` when references or legacy keys can be resolved
  - current backend keeps the existing localized shape for `name` / `description` in responses: `{ ua, en }`

Material / manufacturer dictionaries:

- `GET /api/materials` returns all materials for select fields.
- `GET /api/manufacturers` returns all manufacturers for select fields.
- Admin-only writes are available under `/api/admin/materials` and `/api/admin/manufacturers`.
- New product forms should send `specifications.material` and `specifications.manufacturer` as ObjectId strings from the dictionaries. The backend will keep legacy `materialKey` and `manufacturerKey` in sync for current filters.

Product attribute dictionaries for product form selects:

- Mongo collections: `productrooms`, `productstyles`, `productcollections`.
- Response `kind` is API metadata only; dictionary rows are stored in separate Mongo collections.
- `GET /api/product-attributes` returns `{ rooms, styles, collections }` for public/admin select options.
- `GET /api/product-attributes/rooms`
- `GET /api/product-attributes/styles`
- `GET /api/product-attributes/collections`
- Admin CRUD:
  - `GET /api/admin/product-attributes`
  - `GET/POST /api/admin/product-attributes/rooms`
  - `GET/POST /api/admin/product-attributes/styles`
  - `GET/POST /api/admin/product-attributes/collections`
  - `PATCH /api/admin/product-attributes/:id`
  - `DELETE /api/admin/product-attributes/:id`
- Product create/edit forms should load these dictionaries and send selected keys in `roomKeys`, `styleKeys`, and `collectionKeys`.
- If a dictionary collection has active values, backend rejects unknown keys for that field with `400`.
- Frontend form notes are in `docs/frontend-product-attributes-cheatsheet.md`.

Product attribute item shape:

```json
{
  "_id": "attribute_id",
  "kind": "room",
  "key": "living_room",
  "name": { "ua": "Вітальня", "en": "Living room" },
  "description": { "ua": "", "en": "" },
  "aliases": ["living_room", "living-room", "livingroom"],
  "sortOrder": 0,
  "isActive": true
}
```

Hydrated product response example:

```json
{
  "specifications": {
    "material": {
      "_id": "material_id",
      "key": "velour",
      "name": { "ua": "Велюр", "en": "Velour" },
      "description": { "ua": "", "en": "" }
    },
    "manufacturer": {
      "_id": "manufacturer_id",
      "key": "soft_form",
      "name": "Soft Form",
      "country": "Ukraine",
      "website": ""
    },
    "ipRating": "IP44"
  }
}
```

### Categories / Subcategories

- `GET /api/categories`
- `GET /api/categories/:category/children`
- `GET /api/subcategories`

### Reviews

- `GET /api/reviews/product/:productId?page=1&limit=10`
  - reviewer public data now returns `user.name` only; reviewer email is no longer exposed
  - returns:
  ```json
  {
    "items": [],
    "total": 0,
    "page": 1,
    "pages": 1,
    "avgRating": 0,
    "count": 0
  }
  ```

- `GET /api/reviews?page=1&limit=20&sort=newest&q=&rating=&productId=`
- `GET /api/reviews/stats?productId=`

### Content / Metadata

- `GET /api/translations/:lang`
- `GET /api/locations`
  - active public locations only

- `GET /api/spec-templates/:typeKey`
- `GET /api/inventory/product/:productId`
- `GET /api/inventory/product/:productId?view=full`
- `GET /api/heartbeat`
- `GET /api/i18n-missing`
- `POST /api/i18n-missing`
  - body:
  ```json
  {
    "key": "catalog.empty",
    "lang": "uk",
    "page": "/catalog",
    "defaultValue": "Нічого не знайдено",
    "meta": {}
  }
  ```
  - `GET /api/i18n-missing` returns AI translation status/config summary
  - `POST /api/i18n-missing` uses Gemini to auto-generate `ua` and `en` values for the key and saves them into MongoDB `translations`
  - Gemini key/model can now come either from backend env or from admin dashboard settings stored in MongoDB
  - supported `lang`: `uk`/`ua`, `en`
  - optional fields: `defaultValue`, `value`, `text`, `fallback`, `force`
  - if both translations already exist and `force` is not set, backend returns existing values without a new AI call
  - if AI translation fails, backend still stores a missing translation report in MongoDB and returns `202`; when `defaultValue` is provided it is also saved into the source language translation doc immediately

## Authenticated User API

### Current User / Presence

- `GET /api/auth/me`
  - returns:
  ```json
  {
    "user": {
      "id": "user_id",
      "firstName": "Ivan",
      "lastName": "Petrenko",
      "name": "Ivan Petrenko",
      "email": "ivan@example.com",
      "phone": "+380...",
      "city": "Kyiv",
      "role": "user",
      "status": "active",
      "isOnline": true,
      "presence": "online",
      "lastSeen": "2026-03-27T12:00:00.000Z",
      "loyalty": {
        "cardNumber": "DC-00001234",
        "tier": "silver",
        "baseDiscountPct": 3,
        "totalSpent": 25000,
        "completedOrders": 4,
        "lastOrderAt": null,
        "notes": "",
        "manualOverride": false
      },
      "rewards": [],
      "rewardsSummary": {
        "active": 0,
        "used": 0,
        "expired": 0
      }
    }
  }
  ```

- `PATCH /api/auth/me`
  - allowed body fields:
  ```json
  {
    "name": "New Name",
    "phone": "+380991112233",
    "city": "Kyiv"
  }
  ```
  - `role` and `status` are not editable here

- `POST /api/auth/logout`
  - body:
  ```json
  {
    "page": "/profile"
  }
  ```
  - response: `{ ok, user }`

- `PATCH /api/users/status`
  - used for user presence
  - body example:
  ```json
  {
    "status": "online",
    "page": "/catalog",
    "active": true,
    "visible": true
  }
  ```

- `POST /api/heartbeat`
  - body:
  ```json
  {
    "page": "/catalog",
    "active": true,
    "visible": true
  }
  ```
  - response: `{ ok, user }`

- `POST /api/heartbeat/offline`
  - body:
  ```json
  {
    "page": "/catalog"
  }
  ```
  - response: `{ ok, user }`

### Likes

- `GET /api/likes`
  - returns likes array

- `POST /api/likes`
  - toggles like on current user
  - body:
  ```json
  {
    "productId": "product_id",
    "productName": "Aurora",
    "productCategory": "sofas",
    "productImage": "https://res.cloudinary.com/your-cloud/image/upload/v1/products/aurora-preview.jpg",
    "discount": 10,
    "price": 20000
  }
  ```
  - response: updated public user object

### Cart

- `GET /api/cart`
- `POST /api/cart/add`
  - body:
  ```json
  {
    "productId": "product_id",
    "qty": 1
  }
  ```

- `PUT /api/cart/qty`
  - body:
  ```json
  {
    "productId": "product_id",
    "qty": 2
  }
  ```

- `DELETE /api/cart/item/:productId`
- `DELETE /api/cart/clear`

### Reviews

- `POST /api/reviews`
  - body:
  ```json
  {
    "productId": "product_id",
    "rating": 5,
    "title": "Сподобалось",
    "text": "Все ок"
  }
  ```
  - response: `{ review, avgRating, count }`

- `DELETE /api/reviews/:id`
  - owner or admin only

### Orders / Checkout

- `POST /api/orders/preview`
  - used before checkout submit
  - body:
  ```json
  {
    "items": [
      { "productId": "product_id", "qty": 2 }
    ],
    "rewardId": "optional_reward_id"
  }
  ```
  - response:
  ```json
  {
    "items": [],
    "totals": {
      "subtotal": 0,
      "loyaltyDiscount": 0,
      "rewardDiscount": 0,
      "totalSavings": 0,
      "cartTotal": 0
    },
    "loyalty": {},
    "appliedReward": null
  }
  ```

- `POST /api/orders`
  - body:
  ```json
  {
    "customer": {
      "fullName": "Ivan Petrenko",
      "phone": "+380991112233",
      "email": "ivan@example.com"
    },
    "delivery": {
      "city": "Kyiv",
      "method": "pickup",
      "pickupLocationId": "location_id",
      "address": "",
      "npOffice": ""
    },
    "items": [
      { "productId": "product_id", "qty": 1 }
    ],
    "rewardId": "optional_reward_id",
    "comment": "optional comment"
  }
  ```
  - delivery `method` supports: `pickup`, `courier`, `nova_poshta`

- `GET /api/orders/my?page=1&limit=20`
- `GET /api/orders/my/:id`

### Chat / Messages

- `POST /api/chat/guest-session`
  - public route for anonymous support chat only
  - body:
  ```json
  {
    "guestName": "Optional guest name"
  }
  ```
  - response:
  ```json
  {
    "guestId": "guest_xxxxx",
    "guestName": "Guest",
    "token": "guest_chat_jwt",
    "expiresAt": "2026-04-14T12:00:00.000Z",
    "supportAdmin": {
      "adminId": "admin_user_id",
      "adminName": "Support Admin",
      "isAiAssistant": false
    }
  }
  ```

- `GET /api/chat/admin-id`
- `GET /api/chat/support-admin`
  - now require `Authorization: Bearer <token>`
  - use these only for logged-in users

- `GET /api/chat/:userId1/:userId2`
- `PATCH /api/chat/read/:senderId/:receiverId`

- `GET /api/messages/:userId1/:userId2`
- `PATCH /api/messages/read/:senderId/:receiverId`
  - legacy aliases for the same conversation history/read logic

Rules:

- non-admin users can access only support conversations that include:
  - their own `userId`
  - an admin `userId`
- non-admin user-to-user chat is now blocked by backend access control

## Admin API

All routes below require:

```http
Authorization: Bearer <admin_token>
```

Use `/api/admin/*` as the main frontend namespace.
Admin area is available for `admin` and `superadmin`, but only `superadmin` can create admins or change user roles/statuses.

### Dashboard

- `GET /api/admin/dashboard`
- `GET /api/admin/stats`
  - dashboard summary currently includes counts like `products`, `categories`, `users`, `chatConversations`, `locations`, `inventoryRows`, `showcaseRows`, `ts`

### Admin Settings / My Account

- `GET /api/admin/settings`
  - returns combined dashboard settings payload:
  ```json
  {
    "me": {
      "firstName": "Admin",
      "lastName": "User",
      "email": "admin@example.com",
      "phone": "+380991112233",
      "city": "Kyiv",
      "role": "admin",
      "status": "active"
    },
    "ai": {
      "provider": "gemini",
      "model": "gemini-2.5-flash-lite",
      "geminiModel": "gemini-2.5-flash-lite",
      "openaiModel": "gpt-5-mini",
      "hasApiKey": true,
      "maskedApiKey": "AIza...I2DI"
    }
  }
  ```

- `GET /api/admin/settings/me`
- `PUT /api/admin/settings/me`
- `PATCH /api/admin/settings/me`

Account update body:

```json
{
  "firstName": "Olena",
  "lastName": "Koval",
  "email": "admin@example.com",
  "phone": "+380991112233",
  "city": "Kyiv",
  "currentPassword": "old-secret",
  "newPassword": "new-secret-123"
}
```

Notes:

- `role` and `status` are not editable in self-account route
- password change requires `currentPassword`
- response returns the same flat account object:
```json
{
  "firstName": "Admin",
  "lastName": "User",
  "email": "admin@example.com",
  "phone": "+380991112233",
  "city": "Kyiv",
  "role": "admin",
  "status": "active"
}
```

### Admin AI Settings

- `GET /api/admin/settings/ai`
- `PUT /api/admin/settings/ai`
- `PATCH /api/admin/settings/ai`
- `PUT /api/admin/settings`
- `PATCH /api/admin/settings`
  - root settings `PUT/PATCH` are aliases for AI settings update

AI settings body examples:

```json
{
  "provider": "gemini",
  "apiKey": "AIza...",
  "model": "gemini-2.5-flash-lite"
}
```

```json
{
  "provider": "openai",
  "openaiApiKey": "sk-...",
  "openaiModel": "gpt-5-mini"
}
```

```json
{
  "clearApiKey": true,
  "provider": "gemini"
}
```

Response shape:

```json
{
  "provider": "gemini",
  "model": "gemini-2.5-flash-lite",
  "geminiModel": "gemini-2.5-flash-lite",
  "openaiModel": "gpt-5-mini",
  "hasApiKey": true,
  "maskedApiKey": "AIza...I2DI"
}
```

Notes:

- AI keys are stored in MongoDB for dashboard management and masked in responses
- backend uses stored DB AI settings first, then falls back to env when DB value is absent
- automatic i18n translation requires Gemini key availability, even if admin chat provider is switched to OpenAI
- backend never returns raw API keys, only `hasApiKey` and `maskedApiKey`

### AI Admin

- `GET /api/admin/ai/status`
- `POST /api/admin/ai/suggest`
- `POST /api/admin/ai/reply`
- `POST /api/admin/ai/respond`

`/suggest` and `/reply` body:

```json
{
  "chatUserId": "guest_xxxxx_or_user_id",
  "instructions": "Optional admin hint",
  "historyLimit": 30
}
```

Expected response shape:

```json
{
  "ok": true,
  "provider": "gemini",
  "model": "gemini-2.5-flash-lite",
  "draft": "AI text",
  "products": [],
  "toolCalls": [],
  "message": null
}
```

When AI reply is actually sent, `message.meta.productCards` may contain clickable product cards for the storefront.

### Products

- `GET /api/admin/products`
- `GET /api/admin/products/stats`
- `GET /api/admin/products/:id`
- `POST /api/admin/products`
- `PUT /api/admin/products/:id`
- `PATCH /api/admin/products/:id`
- `DELETE /api/admin/products/:id`
- `GET /api/admin/products/:id/dimensions`
- `PATCH /api/admin/products/:id/dimensions`
- `DELETE /api/admin/products/:id/dimensions`
- `GET /api/admin/products/:id/ip-rating`
- `PATCH /api/admin/products/:id/ip-rating`
- `DELETE /api/admin/products/:id/ip-rating`
- `GET /api/admin/products/:id/characteristics`
- `PATCH /api/admin/products/:id/characteristics`
- `DELETE /api/admin/products/:id/characteristics`

`POST/PUT/PATCH /api/admin/products` accept `application/json` or `multipart/form-data`.
Product media can be sent as URL fields or uploaded files. Product images are capped at 10 total images, including preview.

Common fields:

- `name`
- `description`
- `sku`
- `slug`
- `category`
- `subCategory`
- `typeKey`
- `price`
- `discount`
- `inStock`
- `stockQty`
- `status`
- `styleKeys`
- `colorKeys`
- `roomKeys`
- `collectionKeys`
- `featureKeys`
- `dimensions`
- `specifications`
- `previewImage`
- `modelUrl`
- `images[]`
- `keepImages` for edit
- `imageUrl1` ... `imageUrl10` for simple one-input-per-photo forms
- `inventoryRows`
- `inventoryByLocations` (alias of `inventoryRows`)

Admin characteristics endpoints:

- `GET /api/admin/products/:id/characteristics` returns `{ dimensions, specifications, ipRating }`.
- `PATCH /api/admin/products/:id/characteristics` accepts `dimensions`, `specifications`, top-level `ipRating`, top-level `materialId` / `manufacturerId`, or top-level dimension aliases like `widthCm`, `heightCm`, `lengthCm`.
- `DELETE /api/admin/products/:id/characteristics` clears standardized dimensions and `specifications.ipRating`, while preserving other product fields.

Recommended dimensions payload:

```json
{
  "dimensions": {
    "widthCm": 84,
    "heightCm": 92,
    "lengthCm": 86
  }
}
```

Inline inventory payload for new or existing product:

```json
{
  "name": { "ua": "Диван Arco Straight Sand", "en": "Arco Straight Sofa Sand" },
  "category": "sofas",
  "subCategory": "straight",
  "price": 32999,
  "inventoryRows": [
    {
      "locationId": "location_id",
      "onHand": 2,
      "reserved": 0,
      "zone": "Hall A / Stand 3",
      "note": "Display sample",
      "isShowcase": true,
      "reason": "Initial stock"
    }
  ]
}
```

Inventory row aliases accepted inside `inventoryRows[]` and `inventoryByLocations[]`:

- `locationId`
- `location`
- `inventoryLocationId`
- `storageLocationId`
- `storageLocation`
- `onHand`
- `quantity`
- `qty`
- `locationQty`
- `reserved`
- `reservedQty`
- `zone`
- `storageZone`
- `note`
- `isShowcase`
- `showcase`
- `reason`

Notes:

- `POST /api/admin/products` can now create the product and immediately upsert one or more inventory rows.
- `PATCH /api/admin/products/:id` and `PUT /api/admin/products/:id` accept the same `inventoryRows` / `inventoryByLocations` block for existing products.
- Product responses include inventory availability derived from `inventories`: `inventorySummary`, `availableLocations`, `pickupLocations`, `availableTotal`, `stockQty`, `inStock`, and `hasStock`.
- Admin product list/detail responses also include `inventoryRows` / `inventoryByLocations` with per-location `onHand`, `reserved`, and `available` quantities.
- Public product detail responses (`GET /api/products/:id`, `GET /api/products/by-slug/:slug`) include `inventoryRows` so the storefront can show where the item can be picked up.

### User filter sidebar

The storefront sidebar can load filter options from the products API and then request filtered products with the selected values.

- `GET /api/products/facets` — returns current facet values for the product catalog, including `colorKeys`, `styleKeys`, `roomKeys`, `collectionKeys`, `materialKeys`, and `manufacturerKeys`.
- `GET /api/products?colorKeys=cream,oak` — filter products by one or more color keys. Product objects store color references in `colorKeys`, and the backend can hydrate matching `colors` from the `colors` collection.
- `GET /api/products?category=chairs&subCategory=armchairs` — filter by category/subcategory.
- `GET /api/products?collectionKeys=cozy` — filter by collection.
- `GET /api/products?priceMin=100&priceMax=500` — filter by price range.

Color values returned in facets are color keys. To show a user-friendly palette and support both exact and nearest-color lookup, use:

- `GET /api/colors` — load the full color palette from the database.
- `GET /api/colors/search?q=абрикос` — search colors by Ukrainian or English name.
- `GET /api/colors/nearest?hex=#E32636` — map a selected or custom hex value to the exact or nearest named color.
- `GET /api/colors/nearest?rgb=227,38,54` — map a selected or custom RGB value to the exact or nearest named color.

Products should keep only color references in `colorKeys`; actual `hex` / `rgb` values should come from the `colors` collection or from hydrated `product.colors`.

#### UI integration flow

1. Load palette values for the filter sidebar:
   - `GET /api/products/facets` to get available `colorKeys` from actual products.
   - `GET /api/colors` to resolve those keys into labels, hex and RGB values.
2. When the user types a color name in the search box:
   - `GET /api/colors/search?q=<text>` to show matching colors.
3. When the user selects a palette color:
   - use the returned color `key` directly in product filtering: `GET /api/products?colorKeys=<colorKey>`.
4. When the user enters a custom color value:
   - call `GET /api/colors/nearest?hex=<hex>` or `GET /api/colors/nearest?rgb=<r>,<g>,<b>`.
   - use `response.color.key` to filter products and show the matched palette color.
   - `response.exact` tells you whether the chosen value was an exact database color.

#### Recommended frontend logic

The recommended frontend contract is:

- The source of truth for the product-color relation is `product.colorKeys`.
- The source of truth for actual color data (`name`, `hex`, `rgb`) is the `colors` collection.
- Use hydrated `product.colors` for product cards/details when it is already present in the response.
- Use `GET /api/colors` to build a reusable palette map keyed by `color.key`.
- Use `GET /api/products/facets` to know which color keys are currently available in the catalog.

Recommended page flow:

1. On catalog page load:
   - request `GET /api/products/facets`
   - request `GET /api/colors`
   - request `GET /api/products?...currentFilters`
2. Build sidebar colors as:
   - take `facets.colorKeys`
   - map each key through the palette from `GET /api/colors`
   - hide unknown keys that are missing in the palette
3. When user clicks a palette color:
   - store selected `colorKey` in URL/query state
   - request `GET /api/products?colorKeys=<colorKey>`
4. When user uses EyeDropper / custom color:
   - get browser hex
   - request `GET /api/colors/nearest?hex=<hex>`
   - take `response.color.key`
   - request `GET /api/products?colorKeys=<response.color.key>`
5. On product card or PDP:
   - use `product.colors[0]` as primary color when available
   - fallback to `paletteMap[product.colorKeys[0]]`
6. Do not store custom RGB in frontend filters or in product payloads:
   - frontend should always convert custom user color to the nearest backend `colorKey`
   - filtering should always happen by `colorKey`

Recommended frontend state shape:

```ts
type CatalogColor = {
  key: string;
  name: { ua: string; en: string };
  hex: string;
  rgb: [number, number, number];
  slug?: string | null;
  group?: string | null;
  isActive?: boolean;
};

type CatalogFiltersState = {
  colorKey: string | null;
  styleKeys: string[];
  roomKeys: string[];
  collectionKeys: string[];
  materialKeys: string[];
  manufacturerKeys: string[];
  priceMin: number | null;
  priceMax: number | null;
  q: string;
};
```

Recommended API sequence for EyeDropper:

```text
1. EyeDropper returns #C2B280
2. GET /api/colors/nearest?hex=%23C2B280
3. Response.color.key -> "sand"
4. GET /api/products?colorKeys=sand
```

### Color helpers

- `GET /api/colors` — return all colors from the database with `key`, `name`, `hex`, `rgb`, and optional `slug`, `group`, `isActive`.
- `GET /api/colors?active=false` — return all colors, including inactive ones.
- `GET /api/colors/search?q=...` — search database colors by Ukrainian or English name or key.
- `GET /api/colors/nearest?hex=#E32636` — return the exact or nearest database color for a selected hex.
- `GET /api/colors/nearest?rgb=227,38,54` — return the exact or nearest database color for a selected RGB value.

Response shape for `/api/colors/nearest`:

```json
{
  "exact": true,
  "color": {
    "key": "alizarin-crimson",
    "ua": "Алізариновий червоний",
    "en": "Alizarin Crimson",
    "hex": "#E32636",
    "rgb": [227, 38, 54]
  },
  "query": {
    "hex": "#E32636",
    "rgb": [227, 38, 54]
  },
  "distance": 0
}
```

Notes:

- `sku` is optional; backend generates it automatically when omitted
- `slug` is optional; backend generates it from product name when omitted
- `typeKey` is optional; backend builds it from `category` + `subCategory`
- multiple image URLs can be sent in `images`, `imageUrls`, `galleryUrls`, or `photoUrls`
- 3D model URL can be sent in `modelUrl` or `model3dUrl`

### Reference dictionaries

- `GET /api/materials`
- `GET /api/manufacturers`
- `GET /api/admin/materials`
- `POST /api/admin/materials`
- `PATCH /api/admin/materials/:id`
- `DELETE /api/admin/materials/:id`
- `GET /api/admin/manufacturers`
- `POST /api/admin/manufacturers`
- `PATCH /api/admin/manufacturers/:id`
- `DELETE /api/admin/manufacturers/:id`

Material create body:

```json
{
  "key": "velour",
  "name": {
    "ua": "Велюр",
    "en": "Velour"
  },
  "description": {
    "ua": "М'який меблевий велюр",
    "en": "Soft furniture velour"
  }
}
```

Manufacturer create body:

```json
{
  "key": "soft_form",
  "name": "Soft Form",
  "country": "Ukraine",
  "website": "https://example.com"
}
```

### Categories / Subcategories

- `GET /api/admin/categories`
- `GET /api/admin/categories/:category/children`
- `POST /api/admin/categories`
- `PUT /api/admin/categories/:id`
- `DELETE /api/admin/categories/:id`
- `GET /api/admin/subcategories`
- `POST /api/admin/categories/:category/children`
- `PUT /api/admin/categories/:category/children/:key`
- `DELETE /api/admin/categories/:category/children/:key`

`POST/PUT /api/admin/categories` use `multipart/form-data`.

Category body fields:

- `category`
- `name_ua`
- `name_en`
- `order`
- `image` or `imageUrl`

Child category body:

```json
{
  "key": "straight-sofas",
  "name_ua": "Прямі дивани",
  "name_en": "Straight sofas",
  "image": "",
  "order": 10
}
```

### Users / CRM / Loyalty

- `GET /api/admin/users`
- `POST /api/admin/users`
- `GET /api/admin/users/:id`
- `GET /api/admin/users/:id/orders?page=1&limit=20&status=`
- `PATCH /api/admin/users/:id/loyalty`
- `POST /api/admin/users/:id/rewards`
- `PATCH /api/admin/users/:id/rewards/:rewardId`
- `PATCH /api/admin/users/:id`
- `PUT /api/admin/users/:id`
- `PATCH /api/admin/users/:id/role`
- `PATCH /api/admin/users/:id/status`
- `DELETE /api/admin/users/:id`

Permissions:

- `GET /api/admin/users` -> `admin`, `superadmin`
- `POST /api/admin/users` -> only `superadmin`
- `PATCH /api/admin/users/:id` -> `admin`, `superadmin`
- `PATCH /api/admin/users/:id/role` -> only `superadmin`
- `PATCH /api/admin/users/:id/status` -> only `superadmin`

Create/update user body:

```json
{
  "firstName": "Ivan",
  "lastName": "Petrenko",
  "email": "ivan@example.com",
  "phone": "+380991112233",
  "city": "Kyiv",
  "role": "user",
  "status": "active",
  "password": "secret123"
}
```

Loyalty update body:

```json
{
  "cardNumber": "DC-00012345",
  "tier": "gold",
  "baseDiscountPct": 5,
  "notes": "VIP client"
}
```

Reward create body:

```json
{
  "type": "next_order_discount",
  "title": "Знижка на наступне замовлення",
  "description": "Після великої покупки",
  "discountPct": 10,
  "amountOff": 0,
  "minOrderTotal": 3000,
  "expiresAt": "2026-04-30T23:59:59.000Z",
  "note": "Manual bonus"
}
```

Reward patch body example:

```json
{
  "status": "cancelled",
  "title": "Updated title",
  "expiresAt": "2026-05-31T23:59:59.000Z"
}
```

Role patch body:

```json
{
  "role": "admin"
}
```

Status patch body:

```json
{
  "status": "banned"
}
```

### Orders

- `GET /api/admin/orders?q=&status=&page=&limit=`
- `GET /api/admin/orders/:id`
- `PATCH /api/admin/orders/:id`
- `POST /api/admin/orders/:id/cancel`
- `DELETE /api/admin/orders/:id`

Admin patch body:

```json
{
  "status": "processing",
  "scheduledAt": "2026-03-29T10:00:00.000Z",
  "adminNote": "Call before delivery"
}
```

Cancel body:

```json
{
  "reason": "Client requested cancellation"
}
```

### Locations

- `GET /api/admin/locations`
- `POST /api/admin/locations`
- `PUT /api/admin/locations/:id`
- `PATCH /api/admin/locations/:id/status`

Location create/update body:

```json
{
  "type": "showroom",
  "city": "Kyiv",
  "nameKey": "showroom_kyiv_center",
  "addressKey": "kyiv_center_address",
  "phone": "+380441112233",
  "coordinates": {
    "lat": 50.4501,
    "lng": 30.5234
  },
  "workingHours": {
    "ua": "Пн-Нд 10:00-20:00",
    "en": "Mon-Sun 10:00-20:00"
  },
  "isActive": true
}
```

Status body:

```json
{
  "isActive": false
}
```

### Inventory / Showrooms / Stock Manipulation

- `GET /api/admin/inventory/overview?q=&locationId=&productId=&showcase=true`
- `GET /api/admin/inventory/location/:locationId`
- `GET /api/admin/inventory/product/:productId`
- `PATCH /api/admin/inventory`
- `DELETE /api/admin/inventory/:id`
- `POST /api/admin/inventory/transfer`
- `GET /api/admin/inventory/movements?productId=&locationId=&type=&limit=`

Public inventory detail for storefront/product page:

- `GET /api/inventory/product/:productId` keeps the legacy response shape and returns an array of inventory rows
- `GET /api/inventory/product/:productId?view=full` returns an expanded payload for frontend flows like `city -> location type -> specific point`
- `GET /api/admin/inventory/product/:productId` now returns the expanded admin payload by default, even without `?view=full`
- supported query params in full mode:
  - `city=Kyiv`
  - `cityKey=kyiv`
  - `type=showroom`
  - `locationId=<location_id>`
  - `showcase=true`

Expanded public response example:

```json
{
  "product": {
    "id": "product_id",
    "name": { "ua": "Стіл", "en": "Table" },
    "slug": "table-oak",
    "category": "tables",
    "status": "active",
    "dimensions": {
      "widthCm": 120,
      "lengthCm": 180,
      "heightCm": 75
    },
    "specifications": {
      "material": {
        "key": "wood",
        "name": { "ua": "Дерево", "en": "Wood" }
      }
    }
  },
  "filters": {
    "city": "Kyiv",
    "cityKey": "kyiv",
    "type": "showroom",
    "locationId": "",
    "showcase": null
  },
  "facets": {
    "cities": [
      { "city": "Kyiv", "cityKey": "kyiv", "cityLabel": "Kyiv", "count": 2 }
    ],
    "types": [
      { "type": "showroom", "count": 1 },
      { "type": "warehouse", "count": 1 }
    ],
    "locations": [
      {
        "id": "location_id",
        "city": "Kyiv",
        "cityKey": "kyiv",
        "cityLabel": "Kyiv",
        "type": "showroom",
        "name": "Center Showroom",
        "address": "Main st. 1",
        "isActive": true
      }
    ]
  },
  "summary": {
    "rows": 1,
    "onHand": 3,
    "reserved": 1,
    "available": 2,
    "showcaseRows": 1
  },
  "items": []
}
```

Frontend recommendation for product point selector:

1. Load `GET /api/inventory/product/:productId?view=full`
2. Build city selector from `facets.cities`
3. After city selection, filter point types from `facets.types` or request the same endpoint with `city/cityKey`
4. After point type selection, render concrete pickup/showroom points from `facets.locations`
5. Show product size/spec fields from `product.dimensions` and `product.specifications`
6. Use `summary.available` and row-level `available` for quantity UX, but keep final stock validation on backend

Inventory upsert body:

```json
{
  "productId": "product_id",
  "locationId": "location_id",
  "onHand": 8,
  "reserved": 2,
  "zone": "Hall A / Stand 3",
  "note": "Display sample",
  "isShowcase": true,
  "reason": "Inventory update"
}
```

Transfer body:

```json
{
  "productId": "product_id",
  "fromLocationId": "location_a",
  "toLocationId": "location_b",
  "quantity": 2,
  "reason": "Moved to showroom",
  "targetZone": "Showroom 2",
  "targetNote": "For display",
  "targetIsShowcase": true
}
```

### Specifications

- `GET /api/admin/spec-templates/:typeKey`
- `POST /api/admin/spec-templates/:typeKey/add-field`
- `POST /api/admin/spec-config/:typeKey/add-field`

Body:

```json
{
  "sectionId": "main",
    "field": {
    "key": "depthCm",
    "label": {
      "ua": "Глибина",
      "en": "Depth"
    },
    "kind": "number",
    "path": "dimensions.depthCm",
    "unit": "cm",
    "required": false
  }
}
```

Inventory delete:

- `DELETE /api/admin/inventory/:id`
- optional query/body field: `reason`
- response:
```json
{
  "ok": true,
  "removed": {
    "id": "inventory_row_id"
  }
}
```

Recommended product data split:

- `dimensions`: shared measurable geometry used across many product groups. Preferred storefront fields are `widthCm`, `heightCm`, and `lengthCm`; `depthCm` and `diameterCm` are still supported for backward compatibility and round/cylindrical products.
- `specifications`: professional type-specific attributes.
- sofa / armchair / bed: `seats`, `sleepingArea`, `mechanismKey`, `upholstery`, `maxLoadKg`
- table / commode / wardrobe: `material`, `doorCount`, `drawerCount`, `shelfCount`
- lighting: `bulbBase`, `bulbCount`, `wattage`, `lightTemperatureK`, `voltageV`, `ipRating`

### Admin Chat

- `GET /api/admin/chat/conversations`
- `GET /api/admin/chat-conversations`
  - legacy alias, prefer `/api/admin/chat/conversations`

- `GET /api/admin/chat/support-admin`
- `GET /api/admin/chat/admin-id`
- `PATCH /api/admin/chat/read/:senderId/:receiverId`
- `GET /api/admin/chat/:userId1/:userId2`

Admin conversations response:

```json
[
  {
    "userId": "guest_xxxxx",
    "userName": "Guest",
    "name": "Guest",
    "lastMessage": "Добрий день",
    "lastDate": "2026-03-27T10:00:00.000Z",
    "unreadCount": 1,
    "isGuest": true,
    "answeredByAdminId": null,
    "answeredByAdminName": null,
    "adminIds": [],
    "adminNames": []
  }
]
```

Admin history returns message array with base fields:

- `_id`
- `sender`
- `receiver`
- `text`
- `isGuest`
- `guestName`
- `isRead`
- `createdAt`
- `updatedAt`
- `senderIsAdmin`
- `receiverIsAdmin`
- `senderName`
- `receiverName`
- `repliedByAdminId`
- `repliedByAdminName`
- `meta.productCards[]` when AI/backend attaches catalog cards

## Legacy / Duplicate Namespaces

These still exist, but frontend admin should prefer `/api/admin/*`:

- `/api/orders` also has admin CRUD when token is admin
- `/api/products` has public GETs and protected admin mutations
- `/api/categories` has public GETs and protected admin mutations
- `/api/inventory` has public product inventory GET and protected admin PATCH
- `/api/spec-templates` and `/api/spec-config` still expose direct routes

Recommended rule:

- storefront/user frontend -> public and user routes
- admin frontend -> `/api/admin/*`

## Socket.IO / Realtime Chat

Socket server shares the same backend origin.

### Join events

- `join`
- `join_chat`

Socket auth is now required during handshake.

Authenticated user/admin example:

```ts
const socket = io(baseUrl, {
  auth: {
    token: userToken
  }
});
```

Anonymous guest example:

```ts
const guestSession = await fetch("/api/chat/guest-session", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ guestName })
}).then((r) => r.json());

const socket = io(baseUrl, {
  auth: {
    token: guestSession.token
  }
});
```

Join payload is now optional. The server ignores arbitrary room ids and only joins the authenticated socket to its own room.

Optional payload:

```json
{
  "userId": "user_or_guest_or_admin_id"
}
```

The backend still accepts the event for backward compatibility, but no longer trusts `id` or `roomId`.

### Send message events

- `message:send`
- `send_message`

Payload:

```json
{
  "sender": "must_match_authenticated_socket_id",
  "receiver": "user_or_guest_id",
  "text": "Привіт",
  "guestName": "Іван"
}
```

Aliases also accepted:

- `from` instead of `sender`
- `to` instead of `receiver`
- `message` instead of `text`
- `senderId`
- `receiverId`
- `chatUserId`

Rules:

- admin sockets can send to customers or guests
- logged-in users can send only to admin receivers
- guest sockets can send only to admin receivers
- spoofed `sender` values are rejected by the backend

### Receive message events

- `message:new`
- `receive_message`

Payload contains the saved message from DB plus aliases:

```json
{
  "_id": "message_id",
  "sender": "guest_xxxxx",
  "receiver": "admin_id",
  "from": "guest_xxxxx",
  "to": "admin_id",
  "text": "Доброго дня",
  "source": "human",
  "meta": null,
  "createdAt": "2026-03-27T12:00:00.000Z"
}
```

## Frontend Update Checklist

### Admin frontend

- [ ] Product create/edit form: replace free-text `materialKey` input with a select loaded from `GET /api/admin/materials` or `GET /api/materials`.
- [ ] Product create/edit form: replace free-text `manufacturerKey` input with a select loaded from `GET /api/admin/manufacturers` or `GET /api/manufacturers`.
- [ ] Product create/edit payload: send selected dictionary ids as `specifications.material` and `specifications.manufacturer`.
- [ ] Product create/edit payload: send size fields under `dimensions` as `widthCm`, `heightCm`, `lengthCm`; keep `depthCm` only if the UI still needs backward-compatible depth.
- [ ] Product create/edit payload: keep dynamic technical fields in `specifications`, for example `ipRating`, `wattage`, `seats`, `doorCount`, `shelfCount`.
- [ ] Product characteristics panel: use `GET /api/admin/products/:id/characteristics` for dimensions and specifications preview.
- [ ] Product characteristics panel: use `PATCH /api/admin/products/:id/characteristics` to update `dimensions`, `ipRating`, `materialId`, `manufacturerId`, or full `specifications`.
- [ ] Product characteristics panel: use `DELETE /api/admin/products/:id/characteristics` only when the admin intentionally clears dimensions and `ipRating`.
- [ ] Dictionary management screen: add materials CRUD using `GET/POST/PATCH/DELETE /api/admin/materials`.
- [ ] Dictionary management screen: add manufacturers CRUD using `GET/POST/PATCH/DELETE /api/admin/manufacturers`.
- [ ] Form validation: show backend 400 messages directly for invalid references, for example `specifications.material was not found`.
- [ ] Product table/details: render hydrated `product.specifications.material.name[lang]` and `product.specifications.manufacturer.name` instead of raw `materialKey` / `manufacturerKey`.

Recommended admin product payload:

```json
{
  "name": { "ua": "Світильник Loft IP44", "en": "Loft IP44 Lamp" },
  "category": "lighting",
  "subCategory": "wall",
  "price": 4999,
  "dimensions": {
    "widthCm": 18,
    "heightCm": 32,
    "lengthCm": 12
  },
  "specifications": {
    "material": "material_object_id",
    "manufacturer": "manufacturer_object_id",
    "ipRating": "IP44",
    "wattage": 12
  }
}
```

### Storefront / user frontend

- [ ] Product cards/details: read sizes from `product.dimensions.widthCm`, `product.dimensions.heightCm`, and `product.dimensions.lengthCm`.
- [ ] Product cards/details: render material from `product.specifications.material.name[currentLang]` when available.
- [ ] Product cards/details: render manufacturer from `product.specifications.manufacturer.name` and optional `country`.
- [ ] Product cards/details: keep fallback support for legacy `product.specifications.materialKey` and `product.specifications.manufacturerKey` until all frontend views are migrated.
- [ ] Catalog filters: continue using `GET /api/products/facets` for `materialKeys` and `manufacturerKeys` if the current filter UI expects keys.
- [ ] Catalog filters: use `GET /api/materials` and `GET /api/manufacturers` to map facet keys to display labels in select/filter UI.
- [ ] Product details availability block: if using `GET /api/inventory/product/:productId?view=full`, render dimensions from `response.product.dimensions`.
- [ ] Localization: use `material.name.ua` / `material.name.en` instead of frontend switch/case dictionaries.
- [ ] Error handling: treat missing optional dimensions as absent values, not as zero; backend omits non-numeric dimension values in normalized responses.

Recommended storefront render fallback:

```ts
const materialName =
  product.specifications?.material?.name?.[lang] ||
  product.specifications?.material?.name?.en ||
  product.specifications?.materialKey ||
  "";

const manufacturerName =
  product.specifications?.manufacturer?.name ||
  product.specifications?.manufacturerKey ||
  "";
```

## Frontend Integration Recommendations

- Always load current user through `GET /api/auth/me` after login/page refresh.
- Use `POST /api/orders/preview` before `POST /api/orders`.
- Render loyalty and rewards from `auth/me`, not from client-side guesswork.
- Admin frontend should not call legacy public mutation routes when `/api/admin/*` exists.
- Storefront support chat must send socket auth token in handshake.
- Anonymous support chat must first call `POST /api/chat/guest-session`, persist `guestId` + `token`, and use `supportAdmin.adminId` from that response.
- Logged-in users must stop using public `/api/chat/admin-id` or `/api/chat/support-admin` without auth; send the regular user JWT.
- For AI catalog answers, render product cards from:
  - `result.products` in AI response
  - `message.meta.productCards` in chat history/socket payload
- Use `storefrontUrl` if backend sends absolute storefront link for product cards.
