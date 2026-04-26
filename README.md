# 工廠管理軟體

一個可攜式桌面 App，用於管理工廠內的「產線 -> 機台 -> 耗材」資料，並依耗材維護週期提供提醒。資料以 JSON 檔保存，不需要資料庫。

## 主要功能

- 建立、編輯、刪除產線。
- 在產線下建立、編輯、刪除機台。
- 在機台下建立、編輯、刪除耗材。
- 為耗材設定「每 N 日維護一次」。
- 顯示耗材維護狀態：正常、7 日內到期、今日到期、逾期。
- 按下「標記已維護」後，下一次提醒會從該次完成時間重新計算。
- 啟動時可選擇「開新存檔」、「開啟存檔」或「讀取預設存檔」。
- 資料使用 JSON，可複製到其他電腦或其他平台版本繼續使用。

## 下載與執行

Windows 使用者可到 GitHub Releases 下載：

- `Factory Manager Portable 1.0.0.exe`：單檔可攜版。
- `Factory Manager Portable-1.0.0-win.zip`：資料夾版，解壓後執行 `Factory Manager Portable.exe`。

建議優先使用 zip 資料夾版，因為資料檔位置比較直觀，也比較適合整個資料夾搬移。

## 存檔流程

啟動後會先看到存檔入口畫面：

- `開新存檔`：選擇位置並建立新的空白 JSON 存檔。
- `開啟存檔`：讀取既有 JSON 存檔。
- `讀取預設存檔`：使用 App 資料夾內的 `data/factory-data.json`。

進入管理畫面後，上方會顯示目前存檔路徑，也可以按 `開啟其他存檔` 切換到另一個 JSON 存檔。

## 資料檔位置

如果選擇 `讀取預設存檔`，資料會放在：

- 開發模式：`data/factory-data.json`
- Windows/Linux 打包版：執行檔同層的 `data/factory-data.json`
- macOS 打包版：`.app` 同層的 `data/factory-data.json`

每次儲存時，程式會先把上一版存成：

```text
factory-data.json.bak
```

## 可攜性說明

不同作業系統需要各自打包版本：

- Windows 使用 Windows 版。
- macOS 使用 macOS 版。
- Linux 使用 Linux 版。

但 JSON 存檔格式共用。只要把 JSON 存檔複製到另一個平台版本，或在 App 裡選擇 `開啟存檔`，就可以沿用同一份資料。

## 開發指令

```powershell
npm install
npm run dev
```

## 測試與建置

```powershell
npm test
npm run build
npm run package:win
```

其他平台打包：

```powershell
npm run package:mac
npm run package:linux
```

## 技術架構

- Electron：桌面 App shell、檔案對話框、JSON 檔案讀寫。
- React：使用者介面。
- TypeScript：型別安全。
- Vite：前端建置。
- Zod：JSON 資料驗證。
- Vitest：單元與 UI 測試。
- electron-builder：跨平台打包。

## 專案結構

```text
electron/          Electron main process、preload、JSON 存取
src/               React 使用者介面
shared/            共用資料模型、驗證與維護提醒邏輯
tests/             單元測試與 UI 測試
data/              預設 JSON 存檔位置
release/           打包輸出，不納入 git
```

## 版本

目前版本：`v1.0.0`

已驗證項目：

- `npm test` 通過。
- `npm run build` 通過。
- Windows 可攜版打包成功。
- packaged GUI smoke test 通過：啟動後會先顯示存檔入口，讀取預設存檔後會進入管理介面。
