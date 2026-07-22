# All Book Reader

Windows desktop reader for **TXT**, **PDF**, **EPUB**, and comic archives (**ZIP/CBZ** or image folders).

Built with Electron, TypeScript, React, pdf.js, and epub.js.

**Repository:** [github.com/omayaro/all_book_reader](https://github.com/omayaro/all_book_reader)

[![CI](https://github.com/omayaro/all_book_reader/actions/workflows/ci.yml/badge.svg)](https://github.com/omayaro/all_book_reader/actions/workflows/ci.yml)

## Features

- Open books via **File → Open**, toolbar **Open**, or **drag and drop**
- **Comics:** `.zip` / `.cbz` (images inside) or an **image folder** (File → Open Folder)
- **Single / Two pages** view (PDF/comic spread; TXT/EPUB two-column)
- Comic **LTR / RTL** reading direction (RTL: page 1 on the right)
- PDF/comic **Fit Width / Fit Page** and zoom
- TXT/EPUB font size via zoom controls
- **Resume reading** at the last page
- **Recent books** (up to 20) with Missing badge and Remove
- **Theme** dropdown: Light / Dark (**Ctrl+D** toggles)
- In-book **search**
- English UI and menus (**Help → About** popup: **Ctrl+Shift+A**)
- **Pin toolbar** checkbox; **View → Toggle Toolbar** (**Ctrl+T**)
- Portable Windows build under `release/` (local build only; not committed)

## Navigation & shortcuts

| Action | Shortcut |
|--------|----------|
| Zoom in / out | **+** / **-** (no Ctrl) |
| Larger / smaller font | **Ctrl+Plus** / **Ctrl+-** |
| Next / previous page | **PageDown** / **PageUp**; arrows **→/←** (LTR) or **←/→** (RTL comics) |
| Go to page | Digits in **Page**, then **Enter** or **Go** (focus returns to reader) |
| Single / two pages | **Ctrl+1** / **Ctrl+2** |
| Fit width / fit page | **Ctrl+3** / **Ctrl+4** |
| Reading LTR / RTL | **Ctrl+→** / **Ctrl+←** |
| Toggle toolbar | **Ctrl+T** |
| Toggle theme | **Ctrl+D** |
| Open / Open folder / Close | **Ctrl+O** / **Ctrl+Shift+O** / **Ctrl+W** |
| Exit | **Ctrl+Q** |

After **Enter** in Page, focus moves to the reader so paging keys work immediately.

## Requirements

- Node.js 20+ (22 recommended)
- Windows 10/11 (desktop app target; CI also runs on Windows)

## Setup

```bash
git clone https://github.com/omayaro/all_book_reader.git
cd all_book_reader
npm install
```

## Develop

```bash
npm run electron:dev
```

Starts the Vite dev server and opens the Electron window.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run electron:dev` | Dev mode (Vite + Electron) |
| `npm run build` | Typecheck, Vite build, Electron compile |
| `npm start` | Run Electron against built `dist/` |
| `npm test` | Unit tests (Vitest) |
| `npm run lint` | ESLint |
| `npm run dist` / `npm run release` | Refresh **`release/`** (portable `.exe` + `win-unpacked`) |
| `npm run dist:dir` | Unpacked app only under `release/win-unpacked/` |

## Release folder (local)

After feature work, rebuild artifacts into `release/` (gitignored):

```bash
npm run release
```

Or:

```bash
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\update-release.ps1
```

Output:

- `release/AllBookReader-<version>-portable.exe`
- `release/win-unpacked/All Book Reader.exe`

Portable mode stores settings next to the executable when `PORTABLE_EXECUTABLE_DIR` is set.

## Continuous integration

Pull requests and pushes to `main` run the **Quality Gate** workflow (same order as the local harness gate):

1. Verify unit tests exist  
2. `npm run lint`  
3. `npm run build`  
4. `npm test`

Workflow file: [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

To block merges when CI fails, enable a branch protection rule on `main` that requires the **Quality Gate** status check.

### Local quality gate (optional)

If you use the harness scripts:

```bash
powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\Users\omaya\.harness\scripts\quality-gate.ps1 -ProjectRoot .
```

Core logic is covered by unit tests under `src/shared/*.test.ts` (format, recent list, reading position, search, settings, theme, page mode, comics).

## Project layout

```
.github/workflows/ CI (PR / main)
electron/          Main process, preload, store
src/
  components/      Home, TXT/PDF/EPUB/comic viewers
  shared/          Pure helpers + unit tests
  App.tsx          Shell, toolbar, shortcuts
samples/           Sample books for manual checks
scripts/           Release helper scripts
```

## License

MIT
