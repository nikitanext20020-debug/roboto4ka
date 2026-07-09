import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AppStateProvider } from "./lib/appState";
import { ThemeProvider } from "./lib/theme";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <AppStateProvider>
        <App />
      </AppStateProvider>
    </ThemeProvider>
  </StrictMode>
);
