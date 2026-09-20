# 專案全域規則

本文件適用於本專案根目錄及所有子目錄。

## CodeGraph

- 本專案已啟用 CodeGraph。需要理解、定位或閱讀程式碼時，優先使用 `codegraph explore "符號名稱或問題"`；也可使用可用的 `codegraph_explore` MCP 工具。
- 修改程式碼後執行 `codegraph sync` 更新索引。新工作副本尚無 `.codegraph/codegraph.db` 時，執行 `codegraph init .` 建立索引；可用 `codegraph status` 檢查。
- `.codegraph/` 中的索引資料是本機生成檔，不提交資料庫。

## 測試資料集中存放

- 所有寫入磁碟的測試資料與測試產物，一律收進專案根目錄的 `test-data/`，包含手動測試、自動測試、smoke test、除錯與展示用的假資料。
- 可重複使用、需要版控的固定素材放 `test-data/fixtures/`；執行時產生的 JSON、備份、暫存檔、截圖、錄影、日誌、測試報告與 Electron／瀏覽器 profile 放 `test-data/runtime/`，不納入 Git。
- 每次執行可在 `test-data/runtime/` 下建立獨立子目錄以避免互相覆寫；禁止散落在專案根目錄、正式 `data/`、桌面、下載或系統暫存目錄。路徑須以專案位置解析，不依賴啟動命令的工作目錄。
- 測試程式仍放 `tests/` 或 `scripts/`；記憶體內的測試物件不必另存成檔。清理時只刪除該次測試建立的子目錄，不得使用或覆寫真實工廠資料。
- 現有 `docs/screenshots/` 為文件引用的正式說明圖片，保留原位；新的測試截圖先存入 `test-data/runtime/`，確定用於文件後才挑選轉存。
