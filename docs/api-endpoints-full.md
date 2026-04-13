# API Endpoints Full List

Цей файл містить всі основні API-ендпойнти, які використовуються у бекенді.
Включено як публічні /api/... маршрути, так і адмінські /api/admin/... маршрути.

---

## Public API Endpoints

### Auth
- POST /api/auth/register
- POST /api/auth/login
- GET /api/auth/me
- PATCH /api/auth/me
- GET /api/auth/me/addresses
- PUT /api/auth/me/addresses
- PATCH /api/auth/me/addresses
- PATCH /api/auth/me/avatar
- DELETE /api/auth/me/avatar
- POST /api/auth/logout
- POST /api/auth/forgot-password
- POST /api/auth/reset-password

### Likes
- GET /api/likes
- POST /api/likes

### Products
- GET /api/products
- GET /api/products/filter
- GET /api/products/facets
- GET /api/products/rooms
- GET /api/products/by-slug/:category/:subCategory/:slug
- GET /api/products/by-slug/:slug
- GET /api/products/:id
- POST /api/products
- PUT /api/products/:id
- PATCH /api/products/:id
- DELETE /api/products/:id
- GET /api/products/stats

### Categories
- GET /api/categories
- GET /api/categories/:category/children
- POST /api/categories/:category/children
- PUT /api/categories/:category/children/:key
- DELETE /api/categories/:category/children/:key
- POST /api/categories
- PUT /api/categories/:id
- DELETE /api/categories/:id

### Subcategories
- GET /api/subcategories

### Reviews
- GET /api/reviews/product/:productId
- GET /api/reviews
- GET /api/reviews/stats
- POST /api/reviews
- PATCH /api/reviews/:id/approve
- DELETE /api/reviews/:id

### Cart
- GET /api/cart
- POST /api/cart/add
- PUT /api/cart/qty
- DELETE /api/cart/item/:productId
- DELETE /api/cart/clear

### Translations
- GET /api/translations/:lang

### Locations
- GET /api/locations
- POST /api/locations

### Inventory
- GET /api/inventory/product/:productId
- GET /api/inventory/product/:productId?view=full
- PATCH /api/inventory
- DELETE /api/inventory/:id

### Messages
- GET /api/messages/:userId1/:userId2
- PATCH /api/messages/read/:senderId/:receiverId

### Chat
- POST /api/chat/guest-session
- GET /api/chat/admin-id
- GET /api/chat/support-admin
- PATCH /api/chat/read/:senderId/:receiverId
- GET /api/chat/:userId1/:userId2

### Colors
- GET /api/colors
- GET /api/colors/search
- GET /api/colors/nearest

### Materials
- GET /api/materials

### Manufacturers
- GET /api/manufacturers

### Orders
- POST /api/orders/preview
- POST /api/orders
- GET /api/orders/my
- GET /api/orders/my/:id
- GET /api/orders
- GET /api/orders/:id
- PATCH /api/orders/:id
- POST /api/orders/:id/cancel
- DELETE /api/orders/:id

### Heartbeat
- GET /api/heartbeat
- POST /api/heartbeat
- POST /api/heartbeat/offline

### i18n Missing
- GET /api/i18n-missing
- POST /api/i18n-missing

---

## Admin API Endpoints

### Admin Products
- GET /api/admin/products
- GET /api/admin/products/stats
- GET /api/admin/products/:id
- POST /api/admin/products
- PUT /api/admin/products/:id
- PATCH /api/admin/products/:id
- DELETE /api/admin/products/:id
- GET /api/admin/products/:id/dimensions
- PATCH /api/admin/products/:id/dimensions
- DELETE /api/admin/products/:id/dimensions
- GET /api/admin/products/:id/ip-rating
- PATCH /api/admin/products/:id/ip-rating
- DELETE /api/admin/products/:id/ip-rating
- GET /api/admin/products/:id/characteristics
- PATCH /api/admin/products/:id/characteristics
- DELETE /api/admin/products/:id/characteristics

Notes:
- `POST/PUT/PATCH /api/admin/products` also accept inline inventory rows under `inventoryRows` or `inventoryByLocations`.
- Each inventory row can include `locationId`, `onHand`, `reserved`, `zone`, `note`, `isShowcase`, `reason`.

### Admin Reference Dictionaries
- GET /api/admin/materials
- POST /api/admin/materials
- PATCH /api/admin/materials/:id
- DELETE /api/admin/materials/:id
- GET /api/admin/manufacturers
- POST /api/admin/manufacturers
- PATCH /api/admin/manufacturers/:id
- DELETE /api/admin/manufacturers/:id

### Admin Categories
- GET /api/admin/categories
- GET /api/admin/categories/:category/children
- POST /api/admin/categories/:category/children
- PUT /api/admin/categories/:category/children/:key
- DELETE /api/admin/categories/:category/children/:key
- POST /api/admin/categories
- PUT /api/admin/categories/:id
- DELETE /api/admin/categories/:id

### Admin Subcategories
- GET /api/admin/subcategories

### Admin Users
- GET /api/admin/users
- POST /api/admin/users
- PATCH /api/admin/users/:id/avatar
- DELETE /api/admin/users/:id/avatar
- GET /api/admin/users/:id
- GET /api/admin/users/:id/orders
- PATCH /api/admin/users/:id/loyalty
- POST /api/admin/users/:id/rewards
- PATCH /api/admin/users/:id/rewards/:rewardId
- PATCH /api/admin/users/:id
- PUT /api/admin/users/:id
- PATCH /api/admin/users/:id/role
- PATCH /api/admin/users/:id/status
- DELETE /api/admin/users/:id

### Admin Orders
- GET /api/admin/orders
- GET /api/admin/orders/:id
- PATCH /api/admin/orders/:id
- POST /api/admin/orders/:id/cancel
- DELETE /api/admin/orders/:id

### Admin Locations
- GET /api/admin/locations
- POST /api/admin/locations
- PUT /api/admin/locations/:id
- PATCH /api/admin/locations/:id/status

### Admin Inventory
- GET /api/admin/inventory/overview
- GET /api/admin/inventory/location/:locationId
- GET /api/admin/inventory/product/:productId
- PATCH /api/admin/inventory
- DELETE /api/admin/inventory/:id
- POST /api/admin/inventory/transfer
- GET /api/admin/inventory/movements

Notes:
- `GET /api/admin/inventory/product/:productId` returns expanded payload with `product`, `summary`, and `items` by default.

### Admin Spec
- GET /api/admin/spec-templates/:typeKey
- POST /api/admin/spec-templates/:typeKey/add-field
- POST /api/admin/spec-config/:typeKey/add-field

### Admin Chat
- GET /api/admin/chat-conversations
- GET /api/admin/chat/conversations
- GET /api/admin/chat/support-admin
- GET /api/admin/chat/admin-id
- PATCH /api/admin/chat/read/:senderId/:receiverId
- GET /api/admin/chat/:userId1/:userId2

### Admin Dashboard
- GET /api/admin/dashboard
- GET /api/admin/stats
- GET /api/admin/dashboard/analytics

### Admin Settings
- GET /api/admin/settings
- PUT /api/admin/settings
- PATCH /api/admin/settings
- GET /api/admin/settings/me
- PUT /api/admin/settings/me
- PATCH /api/admin/settings/me
- GET /api/admin/settings/ai
- PUT /api/admin/settings/ai
- PATCH /api/admin/settings/ai

### Admin AI
- GET /api/admin/ai/status
- POST /api/admin/ai/suggest
- POST /api/admin/ai/reply
- POST /api/admin/ai/respond

### Admin Spec Management
- GET /api/admin/spec/fields
- POST /api/admin/spec/fields
- PUT /api/admin/spec/fields/:id
- DELETE /api/admin/spec/fields/:id
- GET /api/admin/spec/templates
- POST /api/admin/spec/templates
- PUT /api/admin/spec/templates/:id
- DELETE /api/admin/spec/templates/:id
- GET /api/admin/spec/dictionaries
- PUT /api/admin/spec/dictionaries
