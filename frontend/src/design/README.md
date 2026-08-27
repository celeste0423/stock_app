# Stock Dashboard design foundation

## Principles

- Light mode is the default. Use white surfaces, low-contrast borders, and blue only for actions or selection.
- Dark mode uses the same semantic tokens instead of page-specific color inversions.
- Page components should consume the `--ui-*` tokens from `tokens.css` rather than adding hardcoded theme colors.
- Shared shell, navigation, panels, forms, tables, and responsive behavior belong in `shell.css`.
- Feature-specific layout remains with each feature so visual changes do not alter page behavior.
- Blur is reserved for raised navigation or menu surfaces. Content cards stay opaque for readability.
- Use 12px, 16px, 20px, or 24px radii according to component size.

## Theme API

`window.StockAppTheme` exposes `getTheme()`, `setTheme(theme)`, and `toggleTheme()`.
The selected theme is persisted under `stock-dashboard:color-theme-v1`; a missing value always resolves to light mode.

## Typography

The app bundles NanumSquare Regular and Bold as WOFF2 files, so it does not depend on a system font or CDN at runtime.
The webfont files are sourced from the [hiun/NanumSquare](https://github.com/hiun/NanumSquare) webfont repository and are credited there to NAVER.
