# Stock Dashboard Frontend

The frontend is built with Vite and React. During the migration, Vite provides
the React runtime and loads the existing page modules through
`src/legacy-manifest.js`. New pages and shared UI should be authored as module
components under `src/`; legacy files remain operational until each page is
migrated.

## Commands

```powershell
.\tools\build_frontend.ps1
```

For the Vite development server, prepend the bundled Node directory to
`PATH` and run `pnpm dev` from this directory.

The development server proxies `/api` to the desktop backend on port 8124.
Production assets are emitted to `frontend/static/vite/` and served by the
existing FastAPI static mount. If no production build is present, FastAPI
serves `frontend/legacy/index.html` so the desktop app remains usable.
