import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { apiClient, tokenStorage } from "../apiClient.js";

const initialState = {
  user: null,
  token: tokenStorage.get(),
  loading: false,
  error: "",
};

export const loginThunk = createAsyncThunk(
  "auth/login",
  async ({ email, password }) => {
    return apiClient("/api/auth/login", {
      method: "POST",
      body: { email, password },
    });
  }
);

export const loadMeThunk = createAsyncThunk("auth/loadMe", async () => {
  return apiClient("/api/auth/me");
});

export const logoutThunk = createAsyncThunk("auth/logout", async () => {
  await apiClient("/api/auth/logout", { method: "POST", body: {} });
  return true;
});

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setToken(state, action) {
      state.token = String(action.payload || "");
      tokenStorage.set(state.token);
    },
    clearSession(state) {
      state.user = null;
      state.token = "";
      state.error = "";
      tokenStorage.clear();
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginThunk.pending, (state) => {
        state.loading = true;
        state.error = "";
      })
      .addCase(loginThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload?.user || null;
        state.token = String(action.payload?.token || "");
        tokenStorage.set(state.token);
      })
      .addCase(loginThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error?.message || "Login failed";
      })
      .addCase(loadMeThunk.pending, (state) => {
        state.loading = true;
        state.error = "";
      })
      .addCase(loadMeThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload?.user || null;
      })
      .addCase(loadMeThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error?.message || "Load profile failed";
      })
      .addCase(logoutThunk.fulfilled, (state) => {
        state.user = null;
        state.token = "";
        state.error = "";
        tokenStorage.clear();
      });
  },
});

export const { setToken, clearSession } = authSlice.actions;
export default authSlice.reducer;
