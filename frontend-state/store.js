import { configureStore } from "@reduxjs/toolkit";
import adminColorsReducer from "./slices/adminColorsSlice.js";
import authReducer from "./slices/authSlice.js";
import catalogReducer from "./slices/catalogSlice.js";
import cartReducer from "./slices/cartSlice.js";

export const createAppStore = () =>
  configureStore({
    reducer: {
      adminColors: adminColorsReducer,
      auth: authReducer,
      catalog: catalogReducer,
      cart: cartReducer,
    },
  });

export const store = createAppStore();
