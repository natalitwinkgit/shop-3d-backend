# Site Functionality Overview

Updated: 2026-03-27
Purpose: short functional description of the current website and admin system, so this file can be used as context for planning the next CRM/CMS features.

State model note:
- This repository is backend-focused and does not implement a frontend centralized state store such as `Redux`.
- Persistent business state lives in MongoDB and is accessed through backend routes and services.
- Any frontend global store, if added in another repository, should mirror backend API data rather than replace it as a source of truth.

## 1. Public Storefront

### Authentication

- Users can register and log in with email and password.
- Public registration creates only a regular `user` account.
- The site supports session restoration through token-based auth.
- The system can return the current authorized user profile.
- The current user can update own `name`, `phone`, and `city` without access to role management.
- Logout is tracked on the backend, so user activity state can be updated correctly.

### Product Catalog

- The storefront has a public product catalog with filtering and faceted search.
- Products can be opened by ID or SEO slug.
- Product cards and product detail pages can show prices, discounts, images, categories, and specs.
- The API supports loading products for category pages, filtered listings, and product detail views.

### Categories and Navigation

- The storefront supports parent categories and child categories.
- Category pages can load children dynamically.
- Subcategories can be used to structure furniture types and product groups.

### Reviews

- Public users can view approved reviews for a specific product.
- The storefront can show overall review lists and rating statistics.
- Authorized users can create reviews.
- Admins can approve or remove reviews.

### Store Content and Metadata

- The site can load translations by language.
- The storefront can load public locations such as shops, showrooms, and pickup points.
- Product specification templates can be loaded for different product types.
- Public inventory by product can be shown if needed.

## 2. User Account Area

### Current User Profile

- The backend returns a normalized user profile for the logged-in user.
- The profile includes contact info, role, account status, and activity state.
- The profile also includes loyalty card data and rewards data.

### Presence and Activity Tracking

- The backend tracks user presence as `online`, `away`, or `offline`.
- Activity can be updated through heartbeat calls.
- Logout and inactivity can move the user into offline state.
- The system stores `lastSeen`, `lastActivityAt`, `lastHeartbeatAt`, `lastLoginAt`, and `lastLogoutAt`.

### Likes / Favorites

- Authorized users can add or remove liked products.
- The frontend can build a favorites page from the likes list.

### Cart

- Users can load the current cart.
- Items can be added, quantity changed, removed, or fully cleared.
- The cart is stored on the backend per user.

### Checkout and Orders

- Users can preview order totals before submitting checkout.
- Checkout supports delivery methods:
  - pickup
  - courier
  - nova_poshta
- The backend calculates totals server-side.
- Loyalty discount and reward discount are applied on the backend, not trusted from the frontend.
- Users can view their own order history and open a specific order.

### Loyalty Card and Rewards

- Each user can have a loyalty card profile with tier and base discount.
- The system supports reward mechanics for the next order.
- Rewards can have discount percent, fixed amount, minimum order total, expiration, and status.
- The backend can automatically apply an available reward in checkout.

### User Chat Widget

- The storefront supports chat between user/guest and support/admin.
- Users and guests can load history and receive new messages in realtime.
- The widget can resolve which admin/support account is used on the backend.

## 3. Admin Panel

### Dashboard

- The admin dashboard can show high-level counters for products, categories, users, chats, locations, inventory rows, and showcase rows.
- It can be used as the main operational summary page.

### Product Management

- Admins can create, update, list, view, and delete products.
- Product editing supports files, images, model files, product attributes, and specifications.
- Product content can be structured for both storefront rendering and internal management.

### Category Management

- Admins can manage top-level categories.
- Admins can manage child categories for each parent category.
- Categories support images, localized names, and ordering.

### Specification Management

- Admins can load specification templates by product type.
- Admins can add fields into spec templates and config templates.
- This allows dynamic product forms for different furniture types.

### User CRM

- Admins can list users and open a specific user profile.
- User cards include profile data, presence state, loyalty data, rewards summary, and order summary.
- `admin` and `superadmin` can work inside the admin panel.
- Only `superadmin` can create admin accounts and manage user roles/statuses.
- Admins can create, update, and delete regular users within the allowed permission rules.
- Admins can open user order history directly from the CRM area.

### Loyalty and Retention Tools

- Admins can manually manage a user loyalty card.
- Admins can assign rewards for the next purchase.
- Admins can update reward status, expiration, and discount settings.
- This already gives a base for repeat-purchase campaigns and VIP treatment.

### Order Management

- Admins can list all orders with filters and pagination.
- Admins can open a specific order.
- Admins can update order status and admin note.
- Admins can cancel or delete orders.
- Reward restore logic is supported when an order is cancelled or deleted.

### Location Management

- Admins can create and edit physical business locations.
- Supported location types:
  - shop
  - showroom
  - office
  - warehouse
- Locations support city, address, phone, coordinates, working hours, and active flag.

### Inventory and Showroom Management

- Admins can see inventory per product and per location.
- Inventory rows store:
  - on-hand stock
  - reserved stock
  - available stock
  - zone
  - note
  - showcase flag
- Admins can move stock between locations.
- The system stores inventory movement history.
- This gives a base for stock control, showroom planning, and physical product placement.

### Admin Chat / Support Workspace

- All admins can access the shared admin chat workspace.
- Admins can see conversations with users and guests.
- The system can mark messages as read and show unread count.
- The admin interface can show which admin answered in a thread.
- Customer-facing widget does not need to expose internal admin identities.

### AI Admin Assistant

- The admin panel includes AI tools for draft generation and auto-reply.
- AI can read internal business data through backend tools, not direct DB access from the model.
- AI can use chat context, user context, orders, products, inventory, locations, and loyalty context.
- AI replies can also return product cards with links for the storefront.

## 4. Realtime and Communication Layer

### Socket Communication

- Chat supports realtime join/send/receive events.
- The backend accepts both legacy and normalized event names.
- Realtime payloads are saved into the database and broadcast to both participants.

### Internal Message Tracking

- Messages are persisted in the database.
- The system supports guest IDs without forcing ObjectId conversion.
- Read/unread state is tracked.
- AI-generated messages and product card metadata can also be stored in the message payload.

## 5. What This System Already Is

Right now the platform is not only a storefront. It already combines:

- e-commerce storefront
- simple CMS for products and categories
- CRM for users, loyalty, orders, and chat
- support desk
- inventory and showroom control
- AI-assisted support workflow

That means the next step is not "build admin panel from scratch", but "upgrade the existing platform into a stronger CRM/CMS/operations system".

## 6. Good Directions for the Next CRM/CMS Upgrade

These are the most valuable areas to improve next.

### CRM Improvements

- lead pipeline for new inquiries
- segmentation of users by purchase history, activity, city, loyalty tier
- tags for users and conversations
- client notes and internal comments
- follow-up reminders for managers
- abandoned cart tracking
- automatic re-engagement campaigns
- customer lifetime value dashboard

### Sales and Support Improvements

- showroom appointment booking
- callback requests
- sales tasks per manager
- conversation status: new, in progress, closed
- SLA timers for support chats
- canned responses and templates
- escalation from AI to human manager

### CMS Improvements

- landing page builder blocks
- promo banners and campaigns
- collection pages
- SEO meta management from admin
- content pages and blog/news module
- homepage editor

### Inventory and Operations Improvements

- barcode or QR support for inventory rows
- stock reservation by order lifecycle
- supplier management
- purchase orders and restock planning
- return and refund workflow
- damage/write-off tracking
- showroom display planning by zone map

### Loyalty and Marketing Improvements

- coupon system
- personalized discounts
- referral program
- birthday offers
- loyalty level automation
- reward expiration notifications

### Analytics Improvements

- funnel dashboard
- product performance dashboard
- conversion by source/channel
- repeat purchase rate
- manager performance dashboard
- AI insight summaries for sales/admin

## 7. Ready Prompt for GPT

You can give GPT this prompt together with this file and `docs/frontend-api-reference.md`:

```text
I have an existing furniture e-commerce platform with:

- public storefront
- user auth and profile
- favorites, cart, checkout, order history
- loyalty card and reward system
- public and admin chat
- AI assistant for admin replies
- admin panel for products, categories, users, orders
- inventory, showroom, location and stock movement management

I want to evolve it into a strong CRM/CMS/operations system for a furniture business.

Based on the current functionality, propose:

1. what features are missing
2. what would bring the most business value first
3. what should be added for CRM
4. what should be added for CMS
5. what should be added for support and sales workflows
6. what should be added for inventory/showroom operations
7. which features can be AI-powered
8. a phased roadmap: MVP, Phase 2, Phase 3

Please answer as a product architect for an e-commerce furniture company.
```

## 8. How To Use This File

- Use this file when discussing product ideas and business logic.
- Use `docs/frontend-api-reference.md` when discussing exact frontend integration and endpoint contracts.
- Use both files together when asking GPT to design the next roadmap.
