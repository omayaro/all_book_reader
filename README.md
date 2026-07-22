# All Book Reader

Windows desktop reader for **TXT**, **PDF**, **EPUB**, and comic archives (**ZIP/CBZ** or image folders).

Built with Electron, TypeScript, React, pdf.js, and epub.js.

**Repository:** [github.com/omayaro/all_book_reader](https://github.com/omayaro/all_book_reader)

[![CI](https://github.com/omayaro/all_book_reader/actions/workflows/ci.yml/badge.svg)](https://github.com/omayaro/all_book_reader/actions/workflows/ci.yml)

## Features

### Opening & library
- Open books via **File → Open**, toolbar **Open**, or **drag and drop**
- **Comics:** `.zip` / `.cbz` (images inside) or an **image folder** (File → Open Folder)
- **Recent books** (up to 20) with Missing badge and Remove
- **Home (file list):** options toolbar is **hidden automatically**; it returns when a book is open (respects Pin)

### Reading modes
- **Single / Two pages** (PDF/comic spread; TXT/EPUB two-column)
- Comic **LTR / RTL** reading direction (RTL: page 1 on the right)
- PDF/comic **Fit Width / Fit Page** and zoom
- Opening a PDF or comic forces **Fit Page @ zoom 1** (height-aware default)
- TXT/EPUB **font size** via zoom / font shortcuts

### PDF & comics
- **Right-hand page preview strip** (PDF, comic, and TXT fixed pages; not EPUB)
- Comic **prefetch** of nearby pages to reduce turn delay
- **Click-drag pan** when zoomed in (left mouse button) on comic images and PDF
- Zoom/layout sizing uses a stable viewport measure to avoid fit-edge **jitter** (scrollbar feedback)

### TXT (fixed pages)
- Large TXT files use **fixed ~8 KiB pages** (newline-aligned), not endless scroll
- Same **Page Up/Down / page jump** controls as PDF
- **Resume** stores last page + page-start byte offset (reopen lands on the same region)
- In-page search can walk forward/backward across pages
- **Page preview strip** shows text snippets per page (same strip UI as PDF/comic)

### General
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
| Pan zoomed image/PDF | **Left-click drag** |
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

Core logic is covered by unit tests under `src/shared/*.test.ts` and related files (format, recent list, reading position, search, settings, theme, page mode, comics, TXT pages, drag-pan, viewport stability).

### TXT resume checks (optional local scripts)

```bash
npx tsx scripts/verify-txt-resume.mts
npx tsx scripts/e2e-txt-resume.mts
```

These expect a large fixture at `samples/TestFile.txt` (not shipped in the repo; place locally for manual/E2E checks).

Headless Electron open-path check:

```bash
set ABR_E2E_TXT_RESUME=samples\TestFile.txt
set ABR_E2E_TXT_OFFSET=13723349
npx electron .
```

## Project layout

```
.github/workflows/ CI (PR / main)
electron/          Main process, preload, store, TXT page session
src/
  components/      Home, viewers, page preview strip
  shared/          Pure helpers + unit tests
  comicPageCache.ts / thumbCache.ts  Comic & strip caches
  readerViewport.ts                  Stable stage measurement
  useReaderDragPan.ts                Click-drag pan
  App.tsx          Shell, toolbar, shortcuts
samples/           Local sample books (large fixtures gitignored)
scripts/           Release + TXT resume helpers
```

## License

MIT
