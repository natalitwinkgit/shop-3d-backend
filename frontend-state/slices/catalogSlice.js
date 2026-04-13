import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { apiClient } from "../apiClient.js";

const initialState = {
  items: [],
  facets: null,
  selectedProduct: null,
  filters: {
    category: "",
    subCategory: "",
    colorKeys: [],
    roomKeys: [],
    collectionKeys: [],
    materialKeys: [],
    manufacturerKeys: [],
    q: "",
  },
  loading: false,
  error: "",
};

const toQueryString = (filters = {}) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      if (!value.length) return;
      params.set(key, value.join(","));
      return;
    }
    if (String(value).trim() === "") return;
    params.set(key, String(value));
  });
  const query = params.toString();
  return query ? `?${query}` : "";
};

export const loadProductsThunk = createAsyncThunk(
  "catalog/loadProducts",
  async (_, { getState }) => {
    const { catalog } = getState();
    const qs = toQueryString(catalog.filters);
    return apiClient(`/api/products${qs}`);
  }
);

export const loadFacetsThunk = createAsyncThunk("catalog/loadFacets", async () => {
  return apiClient("/api/products/facets");
});

export const loadProductBySlugThunk = createAsyncThunk(
  "catalog/loadProductBySlug",
  async ({ slug }) => {
    return apiClient(`/api/products/by-slug/${encodeURIComponent(slug)}`);
  }
);

const catalogSlice = createSlice({
  name: "catalog",
  initialState,
  reducers: {
    setFilters(state, action) {
      state.filters = { ...state.filters, ...(action.payload || {}) };
    },
    resetFilters(state) {
      state.filters = { ...initialState.filters };
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadProductsThunk.pending, (state) => {
        state.loading = true;
        state.error = "";
      })
      .addCase(loadProductsThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.items = Array.isArray(action.payload) ? action.payload : [];
      })
      .addCase(loadProductsThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error?.message || "Products load failed";
      })
      .addCase(loadFacetsThunk.fulfilled, (state, action) => {
        state.facets = action.payload || null;
      })
      .addCase(loadProductBySlugThunk.fulfilled, (state, action) => {
        state.selectedProduct = action.payload || null;
      });
  },
});

export const { setFilters, resetFilters } = catalogSlice.actions;
export default catalogSlice.reducer;
