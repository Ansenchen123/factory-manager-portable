import { app, BrowserWindow, dialog, ipcMain, type OpenDialogOptions, type SaveDialogOptions } from 'electron';
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
    minWidth: 1100,
    minHeight: 720,
    title: '工廠管理軟體',
    backgroundColor: '#f6f7f9',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
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
