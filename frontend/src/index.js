import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

const isDev = process.env.NODE_ENV !== 'production';

// Service worker completely disabled - no registration in any environment
// Unregister any existing service workers
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => {
      registration.unregister();
      if (isDev) {
        console.log('Service worker unregistered');
      }
    });
  });
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
