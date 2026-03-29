# Frontend API Reference

Updated: 2026-03-27
Source of truth: current mounted routes in `index.js` and route definitions in `routes/`.

## Base

- Local base URL: `http://localhost:5000`
- API prefix: `/api`
- Static files: `/uploads/...`
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

### Categories / Subcategories

- `GET /api/categories`
- `GET /api/categories/:category/children`
- `GET /api/subcategories`

### Reviews

- `GET /api/reviews/product/:productId?page=1&limit=10`
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
- `GET /api/chat/admin-id`
- `GET /api/chat/support-admin`
- `GET /api/heartbeat`
- `GET /api/i18n-missing`
- `POST /api/i18n-missing`
  - body:
  ```json
  {
    "key": "catalog.empty",
    "lang": "uk",
    "page": "/catalog",
    "meta": {}
  }
  ```

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
    "productImage": "/uploads/products/...",
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

- `GET /api/chat/:userId1/:userId2`
- `PATCH /api/chat/read/:senderId/:receiverId`

- `GET /api/messages/:userId1/:userId2`
- `PATCH /api/messages/read/:senderId/:receiverId`
  - legacy aliases for the same conversation history/read logic

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
- `DELETE /api/admin/products/:id`

`POST/PUT /api/admin/products` use `multipart/form-data`.

Common fields:

- `name`
- `description`
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
- `specifications`
- `images[]`
- `modelFile`
- `keepImages` for edit

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
- `POST /api/admin/inventory/transfer`
- `GET /api/admin/inventory/movements?productId=&locationId=&type=&limit=`

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
    "key": "depth",
    "label": {
      "ua": "Глибина",
      "en": "Depth"
    },
    "kind": "number",
    "path": "dimensions.depth",
    "unit": "mm",
    "required": false
  }
}
```

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

Payload:

```json
{
  "userId": "user_or_guest_or_admin_id"
}
```

The backend also accepts `id` and `roomId`.

### Send message events

- `message:send`
- `send_message`

Payload:

```json
{
  "sender": "admin_or_user_id",
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

## Frontend Integration Recommendations

- Always load current user through `GET /api/auth/me` after login/page refresh.
- Use `POST /api/orders/preview` before `POST /api/orders`.
- Render loyalty and rewards from `auth/me`, not from client-side guesswork.
- Admin frontend should not call legacy public mutation routes when `/api/admin/*` exists.
- For AI catalog answers, render product cards from:
  - `result.products` in AI response
  - `message.meta.productCards` in chat history/socket payload
- Use `storefrontUrl` if backend sends absolute storefront link for product cards.
