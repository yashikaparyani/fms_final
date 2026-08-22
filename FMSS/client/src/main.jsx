import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Provider } from "react-redux";
import { ThemeProvider } from "@mui/material/styles";
import { store } from "./redux/store";
import App from "./App";
import theme from "./style/muiTheme";
import "./index.css";
import { loginSuccess } from "./redux/authSlice";

const storedUser = localStorage.getItem("user");
const storedToken = localStorage.getItem("api_token");

if (storedUser && storedToken) {
  store.dispatch(
    loginSuccess({
      user: JSON.parse(storedUser),
      api_token: storedToken,
    })
  );
}

// The signed-in role drives every accent in the app through `--role-accent`
// (see index.css). Stamped on <body> here so it is set before first paint —
// RoleTheme keeps it in sync afterwards.
try {
  const role = storedUser ? JSON.parse(storedUser)?.role : null;
  if (role) document.body.dataset.role = role;
} catch {
  /* a corrupt stored user is not worth blocking boot over */
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <Provider store={store}>
    <ThemeProvider theme={theme}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </Provider>
);
