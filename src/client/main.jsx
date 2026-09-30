import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppProviders } from "./store.jsx";
import App from "./App.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </StrictMode>,
);
