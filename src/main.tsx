import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter } from "react-router-dom";
import "zmp-ui/zaui.css";
import "./styles.css";
import "./method.css";
import "./timesheet.css";
import App from "./App";

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } });

ReactDOM.createRoot(document.getElementById("app")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}><HashRouter><App /></HashRouter></QueryClientProvider>
  </React.StrictMode>,
);
