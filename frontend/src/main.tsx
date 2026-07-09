import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ChatHistoryProvider } from "./contexts/ChatHistoryContext";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <ChatHistoryProvider>
        <App />
      </ChatHistoryProvider>
    </ThemeProvider>
  </StrictMode>,
);
