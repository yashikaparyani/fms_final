import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  user: null,
  api_token: null,
  isAuthenticated: false,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    loginSuccess: (state, action) => {
      state.user = action.payload.user;
      state.api_token = action.payload.api_token;
      state.isAuthenticated = true;
    },
    logout: (state) => {
      state.user = null;
      state.api_token = null;
      state.isAuthenticated = false;
      localStorage.removeItem("user");
      localStorage.removeItem("api_token");
    },
  },
});

export const { loginSuccess, logout } = authSlice.actions;
export default authSlice.reducer;