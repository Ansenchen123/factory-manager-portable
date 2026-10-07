import { app, BrowserWindow, ipcMain, net, shell } from 'electron';
import fs from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { downloadRelease, releaseApi, releasePage, selectRelease } from './updateFiles';
import type { UpdateState } from '../shared/updates';

export function setupUpdater(getWindow: () => BrowserWindow | undefined) {
  const target = process.platform === 'win32' && app.isPackaged && process.arch === 'x64'
    ? process.env.PORTABLE_EXECUTABLE_FILE : undefined;
  let state: UpdateState = { status: 'idle', currentVersion: app.getVersion(), canInstall: Boolean(target) };
  let stage: string | undefined;
  let helper: ChildProcess | undefined;
  let workerPid: number | undefined;
  app.on('will-quit', () => {
    if (state.status === 'installing' && stage && workerPid) writeFileSync(path.join(stage, 'commit'), 'install');
  });
  const active = () => ['checking', 'downloading', 'installing'].includes(state.status);
  const send = (patch: Partial<UpdateState>) => {
    state = { ...state, ...patch };
    const window = getWindow();
    if (window && !window.isDestroyed()) window.webContents.send('app-update:state', state);
    return state;
  };
  async function check() {
    if (active() || state.status === 'ready') return state;
    send({ status: 'checking', message: undefined, release: undefined, percent: undefined });
    try {
      const response = await net.fetch(releaseApi, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Factory-Manager-Portable' }, signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error('無法檢查更新，請稍後再試。');
      const release = selectRelease(await response.json(), app.getVersion());
      return send({ status: release ? 'available' : 'current', release });
    } catch { return send({ status: 'error', message: '無法檢查更新，請確認網路連線後重試。' }); }
  }
  ipcMain.handle('app-update:state', () => state);
  ipcMain.handle('app-update:check', check);
  ipcMain.handle('app-update:open', () => shell.openExternal(releasePage));
  ipcMain.handle('app-update:download', async () => {
    if (active() || state.status === 'ready' || !state.release || !target) return state;
    const release = state.release;
    send({ status: 'downloading', percent: 0, message: undefined });
    try {
      stage = await fs.mkdtemp(path.join(path.dirname(target), '.factory-update-'));
      await downloadRelease(release, stage, net.fetch.bind(net) as typeof fetch, percent => {
        if (percent !== state.percent) send({ percent });
      });
      return send({ status: 'ready' });
    } catch (error) {
      return send({ status: 'error', message: error instanceof Error ? error.message : '下載失敗，請重試。' });
    }
  });
  ipcMain.handle('app-update:install', async () => {
    if (state.status !== 'ready' || !stage || !target || !state.release) throw new Error('請先完成更新下載。');
    send({ status: 'installing', message: undefined });
    try {
      const script = path.join(stage, 'install.ps1');
      const manifest = path.join(stage, 'update.json');
      await fs.rm(path.join(stage, 'ready'), { force: true });
      await fs.rm(path.join(stage, 'commit'), { force: true });
      await fs.rm(path.join(stage, 'result.json'), { force: true });
      await fs.copyFile(path.join(app.getAppPath(), 'assets', 'update-portable.ps1'), script);
      await fs.writeFile(manifest, JSON.stringify({ target, processId: process.pid, sha256: state.release.sha256, version: state.release.version }), 'utf8');
      const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
      helper = spawn(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-ManifestPath', manifest],
        { windowsHide: true, stdio: 'ignore', cwd: stage });
      await new Promise<void>((resolve, reject) => { helper!.once('spawn', resolve); helper!.once('error', reject); });
      // Keep the application open until PowerShell has validated the download and is waiting.
      let ready = false;
      for (let i = 0; i < 100; i++) {
        const pid = Number(await fs.readFile(path.join(stage, 'ready'), 'utf8').catch(() => ''));
        if (Number.isInteger(pid) && pid > 0) { workerPid = pid; ready = true; break; }
        if (helper.exitCode !== null && helper.exitCode !== 0) break;
        if (await fs.stat(path.join(stage, 'result.json')).then(() => true, () => false)) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (!ready) throw new Error('更新程序未就緒。');
      helper.unref();
      setTimeout(() => app.quit(), 0);
    } catch {
      helper?.kill(); helper = undefined;
      if (workerPid) { try { process.kill(workerPid); } catch {} workerPid = undefined; }
      send({ status: 'ready', message: '無法啟動更新，請重試。' });
      throw new Error('無法啟動更新，請重試。');
    }
  });
  return {
    check,
    installing: () => state.status === 'installing',
    cancelInstall: () => {
      helper?.kill(); helper = undefined;
      if (workerPid) { try { process.kill(workerPid); } catch {} workerPid = undefined; }
      send({ status: 'ready', message: '仍有未儲存的內容，請先儲存再更新。' });
    },
  };
}
