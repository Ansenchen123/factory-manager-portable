import { app, BrowserWindow, dialog, ipcMain, Menu, type OpenDialogOptions, type SaveDialogOptions } from 'electron';
import path from 'node:path';
import {
  createFactoryDataSession,
  getFactoryDataPath,
  loadFactoryDataSession,
  saveFactoryData,
} from './factoryData';

const isDev = !app.isPackaged;
let mainWindow: BrowserWindow | undefined;
let activeDataPath = '';

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 640,
    minHeight: 480,
    title: '工廠管理軟體',
    backgroundColor: '#f6f7f9',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const editMenu = [
    { label: '復原', role: 'undo' as const },
    { label: '重做', role: 'redo' as const },
    { type: 'separator' as const },
    { label: '剪下', role: 'cut' as const },
    { label: '複製', role: 'copy' as const },
    { label: '貼上', role: 'paste' as const },
    { label: '全選', role: 'selectAll' as const },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
    { label: '檔案', submenu: [{ label: '關閉視窗', role: 'close' as const }] },
    { label: '編輯', submenu: editMenu },
    { label: '檢視', submenu: [
      { label: '放大', role: 'zoomIn' }, { label: '縮小', role: 'zoomOut' },
      { label: '原始大小', role: 'resetZoom' }, { label: '全螢幕', role: 'togglefullscreen' },
    ] },
  ]));
  mainWindow.webContents.on('context-menu', (_event, params) => {
    if (params.isEditable) {
      Menu.buildFromTemplate(editMenu.map(item => {
        if (!item.role) return item;
        const enabled = { undo: params.editFlags.canUndo, redo: params.editFlags.canRedo,
          cut: params.editFlags.canCut, copy: params.editFlags.canCopy,
          paste: params.editFlags.canPaste, selectAll: params.editFlags.canSelectAll }[item.role];
        return { ...item, enabled };
      })).popup({ window: mainWindow });
    } else if (params.selectionText) {
      Menu.buildFromTemplate([{ label: '複製', role: 'copy' }]).popup({ window: mainWindow });
    }
  });
  mainWindow.webContents.on('will-prevent-unload', event => {
    const parent = getDialogParent();
    if (!parent) return;
    const choice = dialog.showMessageBoxSync(parent, {
      type: 'question',
      title: '離開前確認',
      message: '仍有尚未儲存的內容或正在進行的儲存作業。',
      detail: '離開可能遺失變更。請等待儲存完成後再關閉。',
      buttons: ['繼續編輯', '捨棄並離開'],
      defaultId: 0,
      cancelId: 0,
    });
    if (choice === 1) event.preventDefault();
  });

  if (isDev) {
    void mainWindow.loadURL('http://127.0.0.1:5173');
  } else {
    void mainWindow.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
  }
}

function getDialogParent(): BrowserWindow | undefined {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
}

function showSaveDialog(options: SaveDialogOptions) {
  const parent = getDialogParent();
  return parent ? dialog.showSaveDialog(parent, options) : dialog.showSaveDialog(options);
}

function showOpenDialog(options: OpenDialogOptions) {
  const parent = getDialogParent();
  return parent ? dialog.showOpenDialog(parent, options) : dialog.showOpenDialog(options);
}

ipcMain.handle('factory-data:create-new', async () => {
  const result = await showSaveDialog({
    title: '建立新的工廠管理存檔',
    defaultPath: getFactoryDataPath(),
    filters: [{ name: '工廠管理 JSON 存檔', extensions: ['json'] }],
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  const session = await createFactoryDataSession(result.filePath);
  activeDataPath = session.path;
  return session;
});

ipcMain.handle('factory-data:open', async () => {
  const result = await showOpenDialog({
    title: '開啟工廠管理存檔',
    defaultPath: path.dirname(activeDataPath || getFactoryDataPath()),
    properties: ['openFile'],
    filters: [{ name: '工廠管理 JSON 存檔', extensions: ['json'] }],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const session = await loadFactoryDataSession(result.filePaths[0]);
  activeDataPath = session.path;
  return session;
});

ipcMain.handle('factory-data:load-default', async () => {
  const session = await loadFactoryDataSession(getFactoryDataPath());
  activeDataPath = session.path;
  return session;
});

ipcMain.handle('factory-data:save', async (_event, data) => {
  if (!activeDataPath) {
    throw new Error('尚未選擇存檔，請先建立或開啟存檔。');
  }

  const savedData = await saveFactoryData(data, activeDataPath);
  return {
    data: savedData,
    path: activeDataPath,
  };
});

ipcMain.handle('factory-data:get-path', () => activeDataPath || getFactoryDataPath());

void app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
