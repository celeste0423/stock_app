# Stock Dashboard design foundation

## Principles

- Light mode is the default. Use white surfaces, low-contrast borders, and blue only for actions or selection.
- Dark mode uses the same semantic tokens instead of page-specific color inversions.
- Page components should consume the `--ui-*` tokens from `tokens.css` rather than adding hardcoded theme colors.
- Shared shell, navigation, panels, forms, tables, and responsive behavior belong in `shell.css`.
- Feature-specific layout remains with each feature so visual changes do not alter page behavior.
- Blur is reserved for raised navigation, app chrome, hero surfaces, loading states, and modal layers. Data-heavy cards stay readable with subtle pseudo-blur glow rather than heavy transparency.
- Use compact 8px radii for dense app controls and cards unless a page-specific visualization needs a larger frame.

## Theme API

`window.StockAppTheme` exposes `getTheme()`, `setTheme(theme)`, and `toggleTheme()`.
The selected theme is persisted under `stock-dashboard:color-theme-v1`; a missing value always resolves to light mode.

## Component API

`window.StockAppUI` exposes `Button`, `Badge`, `EmptyState`, `Icon`, `LoadingBlock`, `MetricCard`, `NoticeBox`, and `SectionTitle` to both Vite modules and legacy feature modules.
New feature code should use these primitives before adding another button, badge, metric card, loading block, empty state, notice box, or icon implementation. The primitives retain the legacy class names during migration, so pages can move incrementally without a full rewrite.

## Typography

The app bundles NanumSquare Regular and Bold as WOFF2 files, so it does not depend on a system font or CDN at runtime.
The webfont files are sourced from the [hiun/NanumSquare](https://github.com/hiun/NanumSquare) webfont repository and are credited there to NAVER.
The current visual layer uses Bold as the default app weight to match the requested high-contrast dashboard style.
