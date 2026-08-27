import React from "react";
import { createRoot } from "react-dom/client";

import "../static/styles.css";
import "./boot.css";
import "./design/tokens.css";
import "./design/shell.css";
import "./design/components.css";
import "./design/pages.css";
import { legacyScripts } from "./legacy-manifest";
import { registerDesignSystem } from "./design/components";
import { initializeTheme } from "./design/theme";

window.React = React;
window.ReactDOM = { createRoot };
window.__STOCK_APP_VITE__ = true;
initializeTheme();
registerDesignSystem();

function showBootError(error) {
  const root = document.getElementById("root");
  if (!root) {
    return;
  }
  root.innerHTML =
    '<div class="boot-fallback"><h1>앱 실행 오류</h1>' +
    '<p>Vite 애플리케이션을 시작하지 못했습니다.</p>' +
    '<div class="boot-error"></div></div>';
  const box = root.querySelector(".boot-error");
  if (box) {
    box.textContent = error instanceof Error ? error.stack || error.message : String(error);
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const devBase = import.meta.env.DEV ? import.meta.env.BASE_URL.replace(/\/$/, "") : "";
    script.src = devBase + src;
    script.async = false;
    script.onload = resolve;
    script.onerror = () => reject(new Error("스크립트를 불러오지 못했습니다: " + src));
    document.head.appendChild(script);
  });
}

async function bootstrap() {
  for (const src of legacyScripts) {
    await loadScript(src);
  }
}

window.addEventListener("error", (event) => {
  if (!document.querySelector(".app-shell")) {
    showBootError(new Error((event.message || "Unknown error") + "\n" + (event.filename || "")));
  }
});

window.addEventListener("unhandledrejection", (event) => {
  if (!document.querySelector(".app-shell")) {
    showBootError(event.reason || new Error("Unknown promise rejection"));
  }
});

bootstrap().catch(showBootError);
