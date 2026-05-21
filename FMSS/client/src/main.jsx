import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Provider } from "react-redux";
import { store } from "./redux/store";
import App from "./App";
import './index.css'
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

ReactDOM.createRoot(document.getElementById("root")).render(
  <Provider store={store}>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </Provider>
);