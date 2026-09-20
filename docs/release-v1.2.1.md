# v1.2.1 前台緊湊版面 · Windows 可攜版

前台減少不必要的空白，讓常用桌面尺寸能一次看完更多待辦。

![前台緊湊版面](https://raw.githubusercontent.com/Ansenchen123/factory-manager-portable/v1.2.1/docs/screenshots/front-desk.png)

- 桌面版將「已逾期」與「今天需要維護」左右並排，窄視窗自動改為上下排列。
- 移除底部固定 200px 留白，縮短標題、存檔資訊、搜尋區及條目間距。
- 到期狀態放在耗材名稱旁，仍完整顯示產線、機台、料號、位置、維護日期與備註。
- 復原區隨內容排列，保留 15 秒復原、搜尋與勾選儲存功能。
- 以六筆待辦（逾期與今日各三筆）實測，在 1280×720、1366×768、1440×900、1024×768 均不需水平或垂直滾動；更多條目、長備註或窄視窗仍可正常滾動，不裁切內容。

## 下載與升級

- `Factory.Manager.Portable.1.2.1.exe`：Windows x64 單檔可攜版。
- `Factory.Manager.Portable-1.2.1-win.zip`：Windows x64 資料夾版。
- 舊 JSON 存檔可直接使用，升級時保留原有 `data` 資料夾。

## 驗證

53 項自動測試、TypeScript 檢查與正式建置通過；實際 Electron 視窗驗證前台尺寸、鍵盤勾選、復原、搜尋、存檔重開及後台切換。
