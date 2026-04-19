# Shop 3D Backend - Project Documentation

## 1. Executive Summary

Shop 3D Backend is the server-side platform for a furniture e-commerce product
with 3D-aware catalog data, admin operations, inventory control, customer
accounts, real-time support chat, AI-assisted responses, and Telegram account
integration.

The backend is organized as a Node.js/Express application with a separate
Telegram bot service. MongoDB is the primary database. The system also integrates
with SMTP for emails, Cloudinary for media, Socket.IO for live chat, and external
AI providers for assistant features.

## 2. Product Scope

Core business domains:

- Catalog: products, categories, subcategories, colors, materials, manufacturers, attributes, media, and 3D model metadata.
- Commerce: carts, likes, orders, inventory rows, stock synchronization, locations, loyalty cards, and transactions.
- Accounts: authentication, profile, addresses, password reset, session security, Telegram account binding.
- Admin: product management, inventory operations, order lifecycle, user management, product questions, planner textures, dashboard, and chat.
- Communication: customer chat, admin direct messages, AI assistant, product question emails, Telegram notifications.
- Operations: seed data, database integrity audit, stock sync scripts, Swagger API docs, test suite.

## 3. High-Level Architecture

```mermaid
flowchart TB
  subgraph Clients
    Web[Customer Web App]
    Admin[Admin Panel]
    TelegramUser[Telegram User]
  end

  subgraph Backend["Main Backend"]
    Express[Express API]
    Routes[Routes]
    Controllers[Controllers]
    Services[Services]
    SocketIO[Socket.IO]
    Swagger[Swagger Docs]
  end

  subgraph TelegramService["Telegram Bot Service"]
    TgWebhook[Webhook / Polling]
    BotLogic[Bot Service]
    TgInternal[Internal API]
  end

  subgraph Data
    Mongo[(MongoDB)]
    Uploads[(Uploads)]
  end

  subgraph External
    Cloudinary[Cloudinary]
    SMTP[SMTP Provider]
    TelegramAPI[Telegram Bot API]
    AI[AI Providers]
    Turnstile[Cloudflare Turnstile]
  end

  Web --> Express
  Admin --> Express
  Express --> Routes --> Controllers --> Services
  Express --> SocketIO
  Express --> Swagger
  Services --> Mongo
  Services --> Uploads
  Services --> Cloudinary
  Services --> SMTP
  Services --> AI
  Services --> Turnstile
  Express --> TgInternal
  TelegramUser --> TelegramAPI
  TelegramAPI --> TgWebhook --> BotLogic
  BotLogic --> TgInternal
  BotLogic --> Mongo
```

## 4. Backend Module Map

```mermaid
flowchart LR
  App[app/createApp.js] --> PublicRoutes[Public Routes]
  App --> AdminRoutes[Admin Routes]
  App --> Middleware[Security & Validation Middleware]
  App --> Docs[Swagger]

  PublicRoutes --> Auth[Auth]
  PublicRoutes --> Catalog[Catalog]
  PublicRoutes --> Cart[Cart]
  PublicRoutes --> Orders[Orders]
  PublicRoutes --> Chat[Chat]
  PublicRoutes --> ProductQuestions[Product Questions]

  AdminRoutes --> AdminCatalog[Admin Catalog]
  AdminRoutes --> Inventory[Inventory]
  AdminRoutes --> AdminOrders[Admin Orders]
  AdminRoutes --> AdminChat[Admin Chat]
  AdminRoutes --> Settings[Settings]

  Auth --> Services[Service Layer]
  Catalog --> Services
  Inventory --> Services
  AdminChat --> Services
  ProductQuestions --> Services

  Services --> Models[Mongoose Models]
  Models --> Mongo[(MongoDB)]
```

## 5. Request Lifecycle

```mermaid
sequenceDiagram
  participant Client
  participant Express
  participant Security as Security Middleware
  participant Route
  participant Controller
  participant Service
  participant Mongo as MongoDB

  Client->>Express: HTTP request
  Express->>Security: CORS, Helmet, rate limit, sanitization
  Security->>Route: validated request
  Route->>Controller: handler
  Controller->>Service: business operation
  Service->>Mongo: query / mutation
  Mongo-->>Service: result
  Service-->>Controller: domain result
  Controller-->>Client: JSON response
```

## 6. Data Model Overview

```mermaid
erDiagram
  USER ||--o{ ORDER : places
  USER ||--o{ CART : owns
  USER ||--o{ LIKE : saves
  USER ||--o{ USER_ADDRESS : has
  USER ||--o{ MESSAGE : sends
  USER ||--o{ LOYALTY_CARD : owns
  USER ||--o{ LOYALTY_TRANSACTION : earns

  PRODUCT ||--o{ INVENTORY : stocked_as
  PRODUCT ||--o{ REVIEW : receives
  PRODUCT ||--o{ PRODUCT_QUESTION : receives
  PRODUCT }o--|| CATEGORY : belongs_to

  ORDER ||--o{ LOYALTY_TRANSACTION : affects
  INVENTORY }o--|| LOCATION : stored_at
  TELEGRAM_BINDING }o--|| USER : links
```

Primary model groups:

- `models/Product.js`, `models/Category.js`, `models/SubCategory.js`: catalog structure.
- `models/Inventory.js`, `models/InventoryMovement.js`, `models/Location.js`: stock and warehouse state.
- `models/Order.js`, `models/Cart.js`, `models/Like.js`: commerce state.
- `models/userModel.js`, `models/UserAddress.js`: customer and admin accounts.
- `models/Message.js`: chat history and delivery/read state.
- `models/LoyaltyCard.js`, `models/LoyaltyTransaction.js`: loyalty accounting.
- `telegram-bot-service/models/*`: Telegram bindings, auth requests, notification logs, audit logs.

## 7. Catalog And Inventory Flow

```mermaid
flowchart TD
  AdminUpdates[Admin creates or updates product] --> ValidateRefs[Validate category/subcategory references]
  ValidateRefs --> ProductSave[Save product]
  ProductSave --> InventoryRows[Inventory rows]
  InventoryRows --> StockSync[Sync product stockQty and inStock]
  StockSync --> PublicCatalog[Public catalog/search responses]
  PublicCatalog --> Customer[Customer sees availability]

  InventoryChange[Inventory upsert/remove/transfer] --> StockSync
```

Key implementation areas:

- `services/catalogIntegrityService.js`: prevents invalid product/category references.
- `services/productStockSyncService.js`: computes stock from inventory rows.
- `scripts/auditDatabaseIntegrity.js`: reports inconsistent database state.
- `scripts/syncProductStockFromInventory.js`: repairs product stock fields from inventory.

## 8. Chat And Support Flow

```mermaid
sequenceDiagram
  participant Customer
  participant Socket as Socket.IO
  participant API as Express API
  participant ChatService
  participant Mongo as MongoDB
  participant Admin

  Customer->>Socket: connect and join own room
  Socket->>ChatService: mark participant connected
  ChatService->>Mongo: mark delivered messages
  Customer->>Socket: send message
  Socket->>ChatService: createChatMessage()
  ChatService->>Mongo: persist message
  ChatService-->>Socket: emit message:new
  Admin->>API: open conversation
  API->>ChatService: mark delivered/read
  ChatService-->>Socket: emit message:status
```

Supported chat capabilities:

- Human support messages.
- Guest and authenticated customer conversations.
- Admin direct-message endpoint.
- Delivery/read state (`sent`, `delivered`, `read`).
- Presence metadata for admin conversation summaries.
- AI admin assistant integration through `services/aiAdminService.js`.

## 9. Telegram Account And Bot Flows

### 9.1 Account Binding

```mermaid
sequenceDiagram
  participant User
  participant Website
  participant MainAPI as Main Backend
  participant TgSvc as Telegram Bot Service
  participant Telegram

  User->>Website: Click "Connect Telegram"
  Website->>MainAPI: Create bind request
  MainAPI->>TgSvc: POST /internal/bind-requests
  TgSvc-->>MainAPI: code + deep link
  Website-->>User: Show Telegram link/code
  User->>Telegram: Open bot with start code
  Telegram->>TgSvc: /start payload
  TgSvc->>User: Ask to share phone contact
  User->>TgSvc: Share contact
  TgSvc->>MainAPI: Resolve/update website user phone
  TgSvc->>TgSvc: Create active binding
  TgSvc-->>User: Styled success message
```

### 9.2 Telegram Login

```mermaid
sequenceDiagram
  participant User
  participant Website
  participant MainAPI as Main Backend
  participant TgSvc as Telegram Bot Service
  participant Telegram

  User->>Website: Choose Telegram login
  Website->>MainAPI: POST /api/auth/telegram/login-request
  MainAPI->>TgSvc: Create login request
  TgSvc->>Telegram: Send confirmation button
  Telegram-->>User: Confirm login
  User->>Telegram: Tap confirm
  Telegram->>TgSvc: callback_query
  TgSvc->>TgSvc: Mark request confirmed
  Website->>MainAPI: Poll request status
  Website->>MainAPI: Redeem confirmed request
  MainAPI-->>Website: JWT + user profile
```

Telegram service files:

- `telegram-bot-service/services/botService.js`: bot commands, menu, profile, orders, notifications.
- `telegram-bot-service/services/authRequestService.js`: bind/login/recovery request lifecycle.
- `telegram-bot-service/services/notificationService.js`: user and campaign notifications.
- `services/telegramServiceClient.js`: main backend client for internal Telegram service calls.

## 10. Security Architecture

```mermaid
flowchart TD
  Request[Incoming Request] --> CORS[CORS allow-list]
  CORS --> Helmet[Helmet security headers]
  Helmet --> RateLimit[Rate limits]
  RateLimit --> Sanitizer[Input sanitizer]
  Sanitizer --> Validation[Zod validation]
  Validation --> Auth[JWT / Admin / Internal auth]
  Auth --> Handler[Route handler]

  Upload[File Upload] --> UploadFilter[Safe raster upload filter]
  PublicForm[Public Form] --> Turnstile[Optional Turnstile verification]
  InternalAPI[Internal API] --> TimingSafe[Timing-safe API key comparison]
```

Security controls currently present:

- Centralized request sanitization removes dangerous Mongo operator and dotted keys.
- Upload filters reject SVG and non-raster image uploads for image fields.
- Static uploads add `nosniff` and force attachment for risky extensions.
- Internal API keys use timing-safe comparison.
- Public product questions can require Cloudflare Turnstile.
- Production error handler hides internal error details for 5xx responses.
- Session binding can run in report or enforce mode.

## 11. Deployment Topology

```mermaid
flowchart LR
  subgraph Hosting
    API[Main Backend Service]
    TG[Telegram Bot Service]
  end

  subgraph ManagedServices
    DB[(MongoDB Atlas)]
    Redis[(Redis optional)]
    CDN[Cloudinary]
    Mail[SMTP]
    BotAPI[Telegram Bot API]
  end

  API --> DB
  TG --> DB
  API --> Redis
  API --> CDN
  API --> Mail
  API --> TG
  TG --> BotAPI
```

Recommended deployment split:

- Main backend service: public HTTP API, Swagger, Socket.IO, admin and customer routes.
- Telegram bot service: public webhook or polling worker plus internal endpoints protected by API key.
- MongoDB Atlas: shared database for backend and Telegram service.
- Optional Redis: distributed rate limits in multi-instance deployments.

## 12. Directory Structure

```text
app/                    Express app factory, core middleware, error handling
admin/                  Admin API router and admin-specific routes
bootstrap/              Server startup
config/                 Environment, CORS, Cloudinary
controllers/            HTTP controllers
docs/                   Project and API documentation
middleware/             Legacy/global middleware
models/                 Mongoose models
routes/                 Public/customer API routes
scripts/                Maintenance, seed, migration, audit scripts
services/               Business logic and integrations
sockets/                Socket.IO server
telegram-bot-service/   Telegram microservice
tests/                  Node test runner tests
```

## 13. Quality Gates

Current validation command:

```bash
npm test
```

Recommended before deployment:

```bash
npm test
npm run db:audit
npm run inventory:sync-stock -- --check
```

## 14. Known Operational Notes

- `MONGO_URI` is required. The backend should not silently fall back to a local database.
- If `TURNSTILE_SECRET_KEY` is empty, product question Turnstile verification is disabled.
- If SMTP is unavailable, admin product question replies are still saved, but email delivery returns `email.sent: false`.
- Telegram login and recovery require an active Telegram binding.
- Uploaded runtime files are ignored by Git and should be backed up or stored externally in production.
