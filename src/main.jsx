import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { createStore } from "./store.js";
import { createApi } from "./api.js";
import { SYNC_API } from "./config.js";

function safeLocalStorage() {
  try {
    return window.localStorage;
  } catch {
    return null; // blocked by browser settings
  }
}

const store = createStore({
  storage: safeLocalStorage(),
  api: SYNC_API ? createApi(SYNC_API) : null,
});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App store={store} />
  </StrictMode>,
);
