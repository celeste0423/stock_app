const STORAGE_KEY = "stock-dashboard:color-theme-v1";
const THEME_EVENT = "stock-dashboard:theme-change";
const DEFAULT_THEME = "light";

function normalizeTheme(value) {
  return value === "dark" ? "dark" : DEFAULT_THEME;
}

function readTheme() {
  try {
    return normalizeTheme(window.localStorage.getItem(STORAGE_KEY));
  } catch (error) {
    return DEFAULT_THEME;
  }
}

function applyTheme(theme, persist) {
  const nextTheme = normalizeTheme(theme);
  document.documentElement.dataset.theme = nextTheme;
  document.documentElement.style.colorScheme = nextTheme;

  if (persist) {
    try {
      window.localStorage.setItem(STORAGE_KEY, nextTheme);
    } catch (error) {
      // Theme changes should still work when browser storage is unavailable.
    }
  }

  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: { theme: nextTheme } }));
  return nextTheme;
}

export function initializeTheme() {
  applyTheme(readTheme(), false);
  window.StockAppTheme = {
    eventName: THEME_EVENT,
    getTheme: () => normalizeTheme(document.documentElement.dataset.theme),
    setTheme: (theme) => applyTheme(theme, true),
    toggleTheme: () => applyTheme(readTheme() === "dark" ? "light" : "dark", true),
  };
}
