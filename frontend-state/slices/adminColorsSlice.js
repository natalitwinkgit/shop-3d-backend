import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { apiClient } from "../apiClient.js";

const pickStr = (value) => String(value ?? "").trim();

const getLocalizedLabel = (value) => {
  if (typeof value === "string") return pickStr(value);
  if (!value || typeof value !== "object") return "";
  return pickStr(value.ua || value.en || "");
};

const normalizeColor = (color = {}) => ({
  _id: pickStr(color._id || color.id),
  id: pickStr(color.id || color._id),
  key: pickStr(color.key),
  name: {
    ua: getLocalizedLabel(color.name?.ua || color.name?.en || color.name),
    en: getLocalizedLabel(color.name?.en || color.name?.ua || color.name),
  },
  hex: pickStr(color.hex).toUpperCase(),
  rgb: Array.isArray(color.rgb) ? color.rgb.map((component) => Number(component)) : [],
  slug: pickStr(color.slug) || null,
  group: pickStr(color.group) || null,
  isActive: color.isActive !== false,
  createdAt: color.createdAt || null,
  updatedAt: color.updatedAt || null,
});

const sortColors = (items = []) =>
  [...items].sort((left, right) => {
    const leftKey = pickStr(left.key).toLowerCase();
    const rightKey = pickStr(right.key).toLowerCase();
    if (leftKey !== rightKey) return leftKey.localeCompare(rightKey);
    return pickStr(left.name?.ua || left.name?.en).localeCompare(
      pickStr(right.name?.ua || right.name?.en)
    );
  });

const mergeColor = (items = [], nextColor = {}) => {
  const normalized = normalizeColor(nextColor);
  const nextId = pickStr(normalized.id || normalized._id);
  const filtered = items.filter((item) => pickStr(item.id || item._id) !== nextId);
  return sortColors([...filtered, normalized]);
};

const removeColor = (items = [], colorId = "") =>
  sortColors(items.filter((item) => pickStr(item.id || item._id) !== pickStr(colorId)));

export const loadAdminColorsThunk = createAsyncThunk("adminColors/load", async () => {
  return apiClient("/api/admin/colors");
});

export const createAdminColorThunk = createAsyncThunk(
  "adminColors/create",
  async (payload) => {
    return apiClient("/api/admin/colors", {
      method: "POST",
      body: payload,
    });
  }
);

export const updateAdminColorThunk = createAsyncThunk(
  "adminColors/update",
  async ({ id, ...patch }) => {
    return apiClient(`/api/admin/colors/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: patch,
    });
  }
);

export const deleteAdminColorThunk = createAsyncThunk("adminColors/delete", async (id) => {
  await apiClient(`/api/admin/colors/${encodeURIComponent(id)}`, {
    method: "DELETE",
    body: {},
  });
  return String(id || "");
});

const initialState = {
  items: [],
  selectedColorId: "",
  loading: false,
  saving: false,
  error: "",
};

const adminColorsSlice = createSlice({
  name: "adminColors",
  initialState,
  reducers: {
    setSelectedColorId(state, action) {
      state.selectedColorId = pickStr(action.payload);
    },
    clearAdminColorsError(state) {
      state.error = "";
    },
    resetAdminColors(state) {
      state.items = [];
      state.selectedColorId = "";
      state.loading = false;
      state.saving = false;
      state.error = "";
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadAdminColorsThunk.pending, (state) => {
        state.loading = true;
        state.error = "";
      })
      .addCase(loadAdminColorsThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.items = sortColors(
          Array.isArray(action.payload) ? action.payload.map((color) => normalizeColor(color)) : []
        );
      })
      .addCase(loadAdminColorsThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error?.message || "Load colors failed";
      })
      .addCase(createAdminColorThunk.pending, (state) => {
        state.saving = true;
        state.error = "";
      })
      .addCase(createAdminColorThunk.fulfilled, (state, action) => {
        state.saving = false;
        state.items = mergeColor(state.items, action.payload);
        state.selectedColorId = pickStr(action.payload?._id || action.payload?.id);
      })
      .addCase(createAdminColorThunk.rejected, (state, action) => {
        state.saving = false;
        state.error = action.error?.message || "Create color failed";
      })
      .addCase(updateAdminColorThunk.pending, (state) => {
        state.saving = true;
        state.error = "";
      })
      .addCase(updateAdminColorThunk.fulfilled, (state, action) => {
        state.saving = false;
        state.items = mergeColor(state.items, action.payload);
        state.selectedColorId = pickStr(action.payload?._id || action.payload?.id);
      })
      .addCase(updateAdminColorThunk.rejected, (state, action) => {
        state.saving = false;
        state.error = action.error?.message || "Update color failed";
      })
      .addCase(deleteAdminColorThunk.pending, (state) => {
        state.saving = true;
        state.error = "";
      })
      .addCase(deleteAdminColorThunk.fulfilled, (state, action) => {
        state.saving = false;
        state.items = removeColor(state.items, action.payload);
        if (pickStr(state.selectedColorId) === pickStr(action.payload)) {
          state.selectedColorId = "";
        }
      })
      .addCase(deleteAdminColorThunk.rejected, (state, action) => {
        state.saving = false;
        state.error = action.error?.message || "Delete color failed";
      });
  },
});

export const {
  setSelectedColorId,
  clearAdminColorsError,
  resetAdminColors,
} = adminColorsSlice.actions;

export default adminColorsSlice.reducer;
