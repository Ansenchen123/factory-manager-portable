# 應用程式圖標

工廠剪影與負形勾號合成單一符號，代表設備管理與完成維護。深綠底、暖白主體，沒有文字與細碎裝飾，方便在工作列的小尺寸辨識。

- `icon.png`：ImageGen 生成的原始方形圖標，也是 Electron 視窗使用的圖標。
- `icon.ico`：由同一張 PNG 轉為 Windows 多尺寸圖標，包含 16、20、24、32、40、48、64、128、256px，用於 EXE 打包。

`package.json` 的 `win.icon` 指向 ICO，`signAndEditExecutable` 必須開啟，才能把圖標寫入實際 EXE；這個設定本身不代表具備數位簽章。Electron 視窗另使用打包內的 `assets/icon.png`。

本機 Windows 若遇到 `winCodeSign-2.6.0` 工具包解壓失敗，原因可能是內含的 macOS 符號連結。可從 electron-builder 已下載的官方工具包解壓至其 `winCodeSign/winCodeSign-2.6.0` 快取，排除 `darwin/`；Windows 所需的 rcedit 與 Windows 工具仍須完整保留。本次已完成此快取準備。

生成方式：內建 ImageGen。先前透明底稿出現透明區域瑕疵，最終改採完整不透明的實色底；沒有修改最終生成圖的造型，只轉換 ICO 格式與所需尺寸。

最終生成提示：

> Create a finished flat app icon for a factory equipment maintenance manager. OUTPUT MUST BE FULLY OPAQUE. One square image completely filled edge-to-edge with a SINGLE UNIFORM solid deep green #174F43. NO alpha, NO transparency, NO rounded outer tile, NO margins, NO vignette, NO shadows, NO gradients, NO texture. In the center, a bold warm-white #F7F7F2 geometric factory silhouette: two wide sawtooth roof peaks and one simple chimney at the right, merged into a single compact white shape. A large confident checkmark is CUT OUT of the lower factory body in the EXACT SAME solid green as the background. The green checkmark is NOT transparent. Factory/check emblem occupies about 68 percent of the square width and height, optically centered. Minimal powerful industrial brand design, exceptionally clean precise straight edges, strong silhouette, balanced negative space, legible at 16 pixels. No windows, doors, smoke, cloud, badge, cog, tools, letters or text. Treat this as a flat two-ink graphic, not a physical object. Entire background including the space above the roof MUST be solid opaque green with no irregular holes, no black areas.
