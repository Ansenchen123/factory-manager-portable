// Run after npm run build, with the renderer dev server on port 5173.
// FACTORY_SMOKE_EXE can point at the packaged executable. Playwright is required.
const { _electron: electron } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const root = path.resolve(__dirname, '..');
  const runtime = path.join(root, 'test-data', 'runtime');
  await fs.mkdir(runtime, { recursive: true });
  const fixture = await fs.mkdtemp(path.join(runtime, 'admin-layout-'));
  const executable = process.env.FACTORY_SMOKE_EXE;
  const app = await electron.launch({ executablePath: executable || require('electron'),
    args: [...(executable ? [] : [root]), `--user-data-dir=${path.join(fixture, 'profile')}`],
    cwd: fixture, env: { ...process.env, PORTABLE_EXECUTABLE_DIR: fixture },
  });
  try {
    const page = await app.firstWindow();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const button = name => page.getByRole('button', { name, exact: true });
    const label = name => page.getByLabel(name, { exact: true });
    const saved = () => page.locator('.workspaceGrid[aria-busy="false"]').waitFor();
    const layouts = [];
    async function capture(name, mustFit) {
      const layout = await page.evaluate(() => ({ width: innerWidth, height: innerHeight,
        scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight }));
      layouts.push({ name, ...layout });
      await page.screenshot({ path: path.join(fixture, `${name}.png`), fullPage: true });
      assert(layout.scrollWidth <= layout.width, `Horizontal overflow: ${JSON.stringify(layout)}`);
      if (mustFit) assert(layout.scrollHeight <= layout.height, `Admin should fit without scrolling: ${JSON.stringify(layout)}`);
    }
    await page.getByRole('button', { name: /讀取預設存檔/ }).click();
    await button('後台管理').click();
    await capture('empty-default', true);
    for (const [width, height] of [[1280, 720], [1366, 768], [1024, 768], [768, 900], [320, 900]]) {
      await page.setViewportSize({ width, height });
      await capture(`empty-${width}`, width >= 1024);
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    assert.equal(await label('機台名稱').count(), 0);
    assert.equal(await label('耗材名稱').count(), 0);
    await label('產線名稱').fill('精密加工一線');
    await button('建立產線').click(); await saved();
    assert.equal(await label('耗材名稱').count(), 0);
    await capture('line-created', true);
    await label('機台名稱').fill('CNC 立式加工中心');
    await button('建立機台').click(); await saved();
    await capture('machine-created', true);
    await label('耗材名稱').fill('冷卻液濾芯');
    await button('建立耗材').click(); await saved();
    await capture('consumable-created', true);
    await button('編輯').click();
    await label('備註').fill('定期檢查密封圈');
    await button('儲存耗材').click(); await saved();
    assert(await label('備註').evaluate(element => element === document.activeElement));
    const data = JSON.parse(await fs.readFile(path.join(fixture, 'data', 'factory-data.json'), 'utf8'));
    assert.equal(data.productionLines[0].machines[0].consumables[0].notes, '定期檢查密封圈');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ fixture, layouts, errors }, null, 2));
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy()));
    await app.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
