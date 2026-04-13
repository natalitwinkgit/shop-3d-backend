import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { apiClient } from "../apiClient.js";

const initialState = {
  cart: { items: [] },
  loading: false,
  error: "",
};

export const loadCartThunk = createAsyncThunk("cart/load", async () => {
  return apiClient("/api/cart");
});

export const addToCartThunk = createAsyncThunk(
  "cart/add",
  async ({ productId, qty = 1 }) => {
    return apiClient("/api/cart/add", {
      method: "POST",
      body: { productId, qty },
    });
  }
);

export const setCartQtyThunk = createAsyncThunk(
  "cart/setQty",
  async ({ productId, qty }) => {
    return apiClient("/api/cart/qty", {
      method: "PUT",
      body: { productId, qty },
    });
  }
);

export const removeCartItemThunk = createAsyncThunk(
  "cart/removeItem",
  async ({ productId }) => {
    return apiClient(`/api/cart/item/${encodeURIComponent(productId)}`, {
      method: "DELETE",
    });
  }
);

const cartSlice = createSlice({
  name: "cart",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    const onPending = (state) => {
      state.loading = true;
      state.error = "";
    };
    const onRejected = (state, action) => {
      state.loading = false;
      state.error = action.error?.message || "Cart request failed";
    };
    const onFulfilled = (state, action) => {
      state.loading = false;
      state.cart = action.payload || { items: [] };
    };

    builder
      .addCase(loadCartThunk.pending, onPending)
      .addCase(loadCartThunk.rejected, onRejected)
      .addCase(loadCartThunk.fulfilled, onFulfilled)
      .addCase(addToCartThunk.pending, onPending)
      .addCase(addToCartThunk.rejected, onRejected)
      .addCase(addToCartThunk.fulfilled, onFulfilled)
      .addCase(setCartQtyThunk.pending, onPending)
      .addCase(setCartQtyThunk.rejected, onRejected)
      .addCase(setCartQtyThunk.fulfilled, onFulfilled)
      .addCase(removeCartItemThunk.pending, onPending)
      .addCase(removeCartItemThunk.rejected, onRejected)
      .addCase(removeCartItemThunk.fulfilled, onFulfilled);
  },
});

export default cartSlice.reducer;
