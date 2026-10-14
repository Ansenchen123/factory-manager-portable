// Packaged main-process checks; native dialog/IME acceptance remains a separate run.
const { _electron: electron } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { extractFile } = require('@electron/asar');
const assert = require('node:assert/strict');

(async () => {
  const root = path.resolve(__dirname, '..');
  const executable = process.env.FACTORY_SMOKE_EXE;
  assert(executable, 'FACTORY_SMOKE_EXE must name the packaged executable');
  const runtime = path.join(root, 'test-data/runtime');
  await fs.mkdir(runtime, { recursive: true });
  const fixture = await fs.mkdtemp(path.join(runtime, 'lifecycle-'));
  const version = JSON.parse(extractFile(path.join(path.dirname(executable), 'resources/app.asar'), 'package.json').toString()).version;
  const cases = [
    { name: 'empty', result: undefined, previous: false, keep: false },
    { name: 'installed', result: { status: 'installed', version }, previous: true, keep: false },
    { name: 'other-version', result: { status: 'installed', version: '0.0.1' }, previous: true, keep: true },
    { name: 'error', result: { status: 'error', message: 'fixture failure' }, previous: true, keep: true },
  ];
  for (const item of cases) {
    item.folder = path.join(fixture, `.factory-update-${item.name}`);
    await fs.mkdir(item.folder);
    if (item.previous) await fs.writeFile(path.join(item.folder, 'previous.exe'), 'fixture');
    if (item.result) await fs.writeFile(path.join(item.folder, 'result.json'), JSON.stringify(item.result));
  }
  const profileArg = `--user-data-dir=${path.join(fixture, 'profile')}`;
  const app = await electron.launch({ executablePath: executable, args: [profileArg], cwd: fixture,
    env: { ...process.env, PORTABLE_EXECUTABLE_DIR: fixture, PORTABLE_EXECUTABLE_FILE: path.join(fixture, 'Factory.exe') } });
  try {
    const page = await app.firstWindow();
    await page.getByText('上次更新未完成，已保留原本的版本。可再次下載更新。', { exact: true }).waitFor();
    for (const item of cases) assert.equal(await fs.stat(item.folder).then(() => true, () => false), item.keep, item.name);
    const guard = await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      let prevented = false;
      window.webContents.emit('will-navigate', { preventDefault() { prevented = true; } }, 'file:///fixture.txt');
      return prevented;
    });
    assert.equal(guard, true);
    const url = page.url();
    await page.evaluate(() => window.open('about:blank'));
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
    assert.equal(page.url(), url);
    await app.evaluate(({ app }) => { globalThis.secondInstanceSeen = false; app.once('second-instance', () => { globalThis.secondInstanceSeen = true; }); });
    const second = spawn(executable, [profileArg], { cwd: fixture, windowsHide: true, stdio: 'ignore' });
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Second instance did not exit')), 10000);
        second.once('error', error => { clearTimeout(timeout); reject(error); });
        second.once('exit', code => { clearTimeout(timeout); code === 0 ? resolve() : reject(new Error(`Exit ${code}`)); });
      });
      assert.equal(await app.evaluate(() => globalThis.secondInstanceSeen), true);
      assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
    } finally { second.kill(); }
    await page.screenshot({ path: path.join(fixture, 'startup-notice.png') });
    console.log(JSON.stringify({ fixture, version, checks: ['four cleanup branches', 'previous failure notice', 'navigation event guard', 'window.open denied', 'second instance exits and signals primary'] }, null, 2));
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
