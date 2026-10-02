import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import AppErrorBoundary from "./components/AppErrorBoundary";
import { ViewerProvider } from "./components/ImageViewer";
import { registerPwa } from "./pwa";
import "./styles.css";

document.documentElement.lang ||= "en";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <ViewerProvider>
        <AppErrorBoundary>
          <App />
        </AppErrorBoundary>
      </ViewerProvider>
    </HashRouter>
  </StrictMode>
);

registerPwa();
