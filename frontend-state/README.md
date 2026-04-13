# Frontend Redux State Module

This folder adds a centralized Redux state layer for frontend integration with this backend API.

## Included

- `store.js` - Redux store with unified reducers
- `apiClient.js` - API wrapper with `Authorization: Bearer <token>` and `localStorage` token persistence
- `slices/authSlice.js` - login/profile/logout state
- `slices/catalogSlice.js` - products, facets, filters, product-by-slug, product attribute dictionaries
- `slices/cartSlice.js` - cart CRUD state

## Install in frontend project

These files require:

```bash
npm i @reduxjs/toolkit react-redux
```

## Minimal connect example

```js
import React from "react";
import { Provider } from "react-redux";
import { store } from "./frontend-state/store.js";
import { App } from "./App.jsx";

export const Root = () => (
  <Provider store={store}>
    <App />
  </Provider>
);
```

## Notes

- This repository is backend-focused. The Redux module is provided as a ready integration layer for a separate frontend codebase.
- `auth_token` is persisted in `localStorage` and automatically attached to API requests.
- Product create/edit forms can dispatch `loadProductAttributesThunk()` and use `catalog.productAttributes.rooms`, `catalog.productAttributes.styles`, and `catalog.productAttributes.collections` for select options.
