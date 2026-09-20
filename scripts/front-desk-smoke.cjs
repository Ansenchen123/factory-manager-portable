// Run after npm run build with the renderer dev server on port 5173.
// Playwright must be resolvable (or set NODE_PATH).
const { _electron: electron } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const root = path.resolve(__dirname, '..');
  const runtime = path.join(root, 'test-data', 'runtime');
  await fs.mkdir(runtime, { recursive: true });
  const fixture = await fs.mkdtemp(path.join(runtime, 'front-desk-'));
  const now = new Date();
  const day = offset => {
    const value = new Date(now);
    value.setDate(value.getDate() + offset);
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  };
  const dates = { createdAt: now.toISOString(), updatedAt: now.toISOString() };
  const item = (id, name, offset, sku) => ({ id, name, sku, ...dates, maintenanceIntervalDays: 30,
    plannedMaintenanceDate: day(offset), notes: '確認設備停止運轉後，依保養程序更換與檢查。' });
  const data = { schemaVersion: 1, ...dates, productionLines: [
    { id: 'a', name: '精密加工一線', ...dates, machines: [
      { id: 'a1', name: 'CNC 立式加工中心', code: 'CNC-01', location: '一樓 A 區', ...dates,
        consumables: [item('filter', '冷卻液濾芯', -3, 'FILTER-01'), item('belt', '主軸傳動皮帶', 0, 'BELT-02')] },
    ] },
    { id: 'b', name: '自動包裝二線', ...dates, machines: [
      { id: 'b1', name: '連續式封口機', code: 'PK-02', location: '二樓 B 區', ...dates,
        consumables: [item('heat', '封口加熱片', 12, 'HEAT-03')] },
    ] },
  ] };
  await fs.mkdir(path.join(fixture, 'data'));
  const file = path.join(fixture, 'data', 'factory-data.json');
  await fs.writeFile(file, JSON.stringify(data));
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
    const check = name => page.getByRole('checkbox', { name: new RegExp(name) });
    const read = async () => JSON.parse(await fs.readFile(file, 'utf8'));
    const saved = () => page.locator('.frontDesk[aria-busy="false"]').waitFor();
    await page.getByRole('button', { name: /讀取預設存檔/ }).click();
    await page.getByRole('heading', { name: '維護工作台', exact: true }).waitFor();
    assert.equal(await page.getByLabel('產線名稱').count(), 0);
    assert.equal(await page.getByRole('region', { name: /已逾期/ }).getByText('冷卻液濾芯', { exact: true }).count(), 1);
    assert.equal(await page.getByRole('region', { name: /今天需要維護/ }).getByText('主軸傳動皮帶', { exact: true }).count(), 1);
    await button('關閉提示').click();
    const layouts = [];
    for (const width of [1440, 1024, 768, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({ path: path.join(fixture, `front-${width}.png`), fullPage: true });
      layouts.push(await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth })));
    }
    assert(layouts.every(layout => layout.scrollWidth <= layout.width), JSON.stringify(layouts));
    await page.setViewportSize({ width: 1440, height: 900 });
    await check('冷卻液濾芯').focus();
    await page.keyboard.press('Space');
    await saved();
    assert.equal(await check('冷卻液濾芯').count(), 0);
    assert(await check('主軸傳動皮帶').evaluate(element => element === document.activeElement), 'Keyboard focus must advance after completion');
    assert((await read()).productionLines[0].machines[0].consumables[0].lastMaintainedAt);
    await page.getByRole('button', { name: /復原.*冷卻液濾芯/ }).click();
    await saved();
    assert.equal((await read()).productionLines[0].machines[0].consumables[0].plannedMaintenanceDate, day(-3));
    assert.equal((await read()).productionLines[0].machines[0].consumables[0].lastMaintainedAt, undefined);
    await page.getByRole('searchbox').fill('pk-02');
    await check('封口加熱片').click();
    await saved();
    assert(await check('封口加熱片').isChecked());
    assert(await check('封口加熱片').isDisabled());
    await page.screenshot({ path: path.join(fixture, 'search-completed.png'), fullPage: true });
    assert.equal((await read()).productionLines[1].machines[0].consumables[0].plannedMaintenanceDate, undefined);
    await page.reload();
    await page.getByRole('button', { name: /讀取預設存檔/ }).click();
    await page.getByRole('searchbox').fill('heat-03');
    assert(await check('封口加熱片').isChecked());
    await button('後台管理').click();
    await page.getByLabel('產線名稱', { exact: true }).fill('草稿測試');
    page.once('dialog', dialog => dialog.dismiss());
    await button('返回前台').click();
    assert.equal(await page.getByLabel('產線名稱', { exact: true }).inputValue(), '草稿測試');
    await page.getByLabel('產線名稱', { exact: true }).fill('');
    await button('返回前台').click();
    await page.getByRole('heading', { name: '維護工作台', exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ fixture, layouts, errors, checks: ['front desk default', 'due date sections', 'full equipment path', 'keyboard completion and focus', 'real IPC save and undo', 'future item search and completion', 'reopen persistence', 'admin switch and draft protection'] }, null, 2));
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy()));
    await app.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
