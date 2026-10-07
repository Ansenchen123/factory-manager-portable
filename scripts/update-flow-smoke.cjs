// Runs the real main/preload/UI/helper flow with a simulated GitHub release and harmless fixture EXE.
// npm run build first. All download and executable replacements stay under test-data/runtime/.
const { _electron: electron } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');

(async () => {
  const root = path.resolve(__dirname, '..');
  const runtime = path.join(root, 'test-data/runtime');
  await fs.mkdir(runtime, { recursive: true });
  const fixture = await fs.mkdtemp(path.join(runtime, 'update-flow-'));
  const compiler = path.join(fixture, 'compile.ps1');
  await fs.writeFile(compiler, `Add-Type -TypeDefinition @'
using System;
using System.IO;
public class UpdateSmoke { public static void Main() { File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "launched.txt"), "updated"); } }
'@ -OutputAssembly 'new.exe' -OutputType ConsoleApplication`);
  const powershell = path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const compile = spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', compiler], { cwd: fixture, windowsHide: true, encoding: 'utf8' });
  assert.equal(compile.status, 0, compile.stderr);
  const payload = await fs.readFile(path.join(fixture, 'new.exe'));
  const target = path.join(fixture, 'Factory.exe');
  await fs.writeFile(target, 'old executable fixture');
  await fs.mkdir(path.join(fixture, 'data'));
  const file = path.join(fixture, 'data/factory-data.json');
  const initial = JSON.stringify({ schemaVersion: 1, productionLines: [], updatedAt: new Date().toISOString() });
  await fs.writeFile(file, initial);
  const version = '1.3.1';
  const assetUrl = `https://github.com/Ansenchen123/factory-manager-portable/releases/download/v${version}/Factory.Manager.Portable.${version}.exe`;
  const metadata = { tag_name: `v${version}`, draft: false, prerelease: false, body: '測試更新：保留工廠存檔。', assets: [
    { name: `Factory.Manager.Portable.${version}.exe`, browser_download_url: assetUrl, size: payload.length,
      state: 'uploaded', digest: 'sha256:' + createHash('sha256').update(payload).digest('hex') },
  ] };
  const bootstrap = path.join(fixture, 'bootstrap.cjs');
  await fs.writeFile(bootstrap, `
const { app, net } = require('electron');
const fs = require('node:fs');
Object.defineProperty(app, 'isPackaged', { get: () => true });
app.getVersion = () => '1.2.2';
app.getAppPath = () => ${JSON.stringify(root)};
let downloads = 0;
net.fetch = async url => {
  if (url === 'https://api.github.com/repos/Ansenchen123/factory-manager-portable/releases/latest') return Response.json(${JSON.stringify(metadata)});
  if (url === ${JSON.stringify(assetUrl)}) {
    downloads++;
    const bytes = fs.readFileSync(${JSON.stringify(path.join(fixture, 'new.exe'))});
    return new Response(downloads === 1 ? Buffer.alloc(bytes.length) : bytes);
  }
  throw new Error('Unexpected external request: ' + url);
};
require(${JSON.stringify(path.join(root, 'dist-electron/electron/main.js'))});
`);
  const executable = process.env.FACTORY_SMOKE_EXE;
  const app = await electron.launch({ executablePath: executable || require('electron'), args: [...(executable ? [] : [bootstrap]), `--user-data-dir=${path.join(fixture, 'profile')}`], cwd: fixture,
    env: { ...process.env, PORTABLE_EXECUTABLE_FILE: target, PORTABLE_EXECUTABLE_DIR: fixture } });
  try {
    const page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    if (executable) {
      for (let i = 0; i < 200; i++) {
        const state = await page.evaluate(() => window.appUpdates.getState());
        if (['current', 'available', 'error'].includes(state.status)) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      await app.evaluate(({ net }, fixtureRelease) => {
        const payload = new Uint8Array(fixtureRelease.bytes);
        let downloads = 0;
        net.fetch = async url => {
          if (String(url).endsWith('/releases/latest')) return { ok: true, json: async () => fixtureRelease.metadata };
          if (url === fixtureRelease.url) {
            const data = ++downloads === 1 ? new Uint8Array(payload.length) : payload;
            return { ok: true, body: (async function* () { yield data; })() };
          }
          throw new Error('Unexpected test request');
        };
      }, { bytes: Array.from(payload), metadata, url: assetUrl });
      const result = await page.evaluate(() => window.appUpdates.check());
      assert.equal(result.status, 'available', JSON.stringify(result));
    }
    await page.getByText('測試更新：保留工廠存檔。', { exact: true }).waitFor();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.getByRole('button', { name: `新版 ${version}`, exact: true }).click();
    await page.getByRole('button', { name: /讀取預設存檔/ }).click();
    await page.getByRole('button', { name: `新版 ${version}`, exact: true }).click();
    await page.getByRole('button', { name: '後台管理', exact: true }).click();
    await page.getByLabel('產線名稱', { exact: true }).fill('尚未儲存');
    // The same update component remains mounted between front and admin.
    if (!await page.getByRole('button', { name: '下載並更新', exact: true }).isVisible()) await page.getByRole('button', { name: `新版 ${version}`, exact: true }).click();
    assert(await page.getByRole('button', { name: '下載並更新', exact: true }).isDisabled());
    await page.getByLabel('產線名稱', { exact: true }).fill('');
    await page.getByRole('button', { name: '下載並更新', exact: true }).click();
    await page.getByText('更新檔案驗證失敗，請重新下載。', { exact: true }).waitFor();
    assert.equal(await fs.readFile(target, 'utf8'), 'old executable fixture');
    await page.setViewportSize({ width: 320, height: 900 });
    const box = await page.getByRole('region', { name: '軟體更新' }).boundingBox();
    assert(box.x >= 0 && box.x + box.width <= 320, 'Update panel must fit a narrow window');
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.screenshot({ path: path.join(fixture, 'update-prompt.png'), fullPage: true });
    const closed = app.waitForEvent('close');
    await page.getByRole('button', { name: '下載並更新', exact: true }).click();
    await closed.catch(async error => {
      console.error('Update state:', await page.evaluate(() => window.appUpdates.getState()).catch(() => null));
      throw error;
    });
    for (let i = 0; i < 200; i++) {
      if (await fs.stat(path.join(fixture, 'launched.txt')).then(() => true, () => false)) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(await fs.readFile(path.join(fixture, 'launched.txt'), 'utf8'), 'updated');
    assert.deepEqual(await fs.readFile(target), payload);
    assert.equal(await fs.readFile(file, 'utf8'), initial);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ fixture, checks: ['startup release notification', 'release notes', 'draft blocks install', 'corrupt download stays open', 'retry downloads again', 'narrow update panel', 'real IPC download and checksum', 'application exits before replacement', 'helper restarts new EXE', 'factory data unchanged'] }, null, 2));
  } finally { await app.close().catch(() => {}); }
})().catch(error => { console.error(error); process.exitCode = 1; });
