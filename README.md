# Factory Manager Portable

Factory Manager Portable is an Electron desktop app for managing factory production lines, machines, consumables, and recurring maintenance reminders in a portable JSON file.

## Features

- Create, edit, and delete production lines, machines, and consumables.
- Store factory data in a portable JSON file that can be opened on another packaged build.
- Create a new data file, open an existing file, or load the default runtime data file.
- Validate the saved JSON shape with Zod before writes complete.
- Keep a backup copy before replacing the current data file.
- Show maintenance status as normal, due soon within seven days, or due now.
- Mark a consumable as maintained so the next reminder is recalculated from that completion time.

## Build and Run

Requirements:

- Node.js and npm.
- The dependencies declared in `package.json`.

Install dependencies:

```powershell
npm install
```

Run the development desktop app:

```powershell
npm run dev
```

Run the Vitest suite. The `test` script is `vitest run`, so this command executes the non-watch test run:

```powershell
npm test
```

Build the renderer and Electron main process:

```powershell
npm run build
```

Create packaged builds:

```powershell
npm run package:win
npm run package:mac
npm run package:linux
```

The default runtime data path is data/factory-data.json. In development it is resolved from the current working directory; in packaged builds it is resolved next to the executable, with a macOS-specific app bundle adjustment in `electron/factoryData.ts`.

## Project Structure

- `electron/` - Electron main process, preload bridge, file dialogs, and JSON data access.
- `shared/` - shared Zod schemas, TypeScript data types, and maintenance reminder logic.
- `src/` - React user interface and styling.
- `tests/` - Vitest unit and component tests.
- `index.html` - Vite HTML entry point.
- `package.json` - npm scripts, dependencies, and electron-builder configuration.
- `package-lock.json` - locked npm dependency tree.
- `vite.config.ts` - Vite renderer build configuration.
- `vitest.config.ts` - Vitest and jsdom test configuration.
- `tsconfig.json` - renderer TypeScript configuration.
- `tsconfig.electron.json` - Electron TypeScript configuration.

## Download

The current public release is `v1.0.0` on GitHub Releases: https://github.com/Ansenchen123/factory-manager-portable/releases

## 繁體中文摘要

- Factory Manager Portable 是 Electron 桌面工具，用於管理產線、機台、耗材與維護提醒。
- 資料以可攜 JSON 檔保存，可建立新存檔、開啟既有存檔，或使用預設執行期路徑。
- npm test 會執行 package.json 中的 vitest run 測試指令。
- 打包指令包含 Windows、macOS 與 Linux，設定由 package.json 的 electron-builder 區塊定義。
- 目前公開版本為 v1.0.0，可從 GitHub Releases 頁面下載。
