// Run after npm run build and npm run dev:renderer. Playwright must be resolvable (or set NODE_PATH).
const { _electron: electron } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
(async () => {
  const root = path.resolve(__dirname, '..');
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'factory-ux-'));
  const executable = process.env.FACTORY_SMOKE_EXE;
  const app = await electron.launch({
    executablePath: executable || require('electron'),
    args: [...(executable ? [] : [root]), `--user-data-dir=${path.join(fixture, 'profile')}`],
    cwd: fixture,
    env: { ...process.env, PORTABLE_EXECUTABLE_DIR: fixture },
  });
  try {
    const page = await app.firstWindow();
    page.setDefaultTimeout(10000);
    page.setDefaultNavigationTimeout(10000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const button = name => page.getByRole('button', { name, exact: true });
    const label = name => page.getByLabel(name, { exact: true });
    const saved = () => page.locator('.workspaceGrid[aria-busy="false"]').waitFor();
    console.log('Fixture:', fixture);
    await page.getByRole('button', { name: /讀取預設存檔/ }).click();
    await label('產線名稱').fill('加工一線');
    await button('建立產線').click(); await saved();
    assert(await label('產線名稱').evaluate(el => el === document.activeElement));
    // A direct fill would hide hit-testing or focus regressions after creating a line.
    await label('機台名稱').click();
    assert(await label('機台名稱').evaluate(el => el === document.activeElement), 'Machine name did not receive mouse focus');
    await page.keyboard.insertText('精密研磨機');
    assert.equal(await label('機台名稱').inputValue(), '精密研磨機');
    await label('代碼').fill('GR-01');
    await button('建立機台').click(); await saved();
    await label('耗材名稱').fill('冷卻濾芯');
    await label('料號').fill('FILTER-01');
    await label('預定維護日期').fill('2027-03-15');
    await button('建立耗材').click(); await saved();
    assert(await page.getByText('2027/03/15', { exact: true }).isVisible());
    await button('複製 冷卻濾芯').click();
    await button('貼上耗材').click(); await saved();
    await button('上移 冷卻濾芯（副本）').click(); await saved();
    const disk = JSON.parse(await fs.readFile(path.join(fixture, 'data/factory-data.json'), 'utf8'));
    assert.equal(disk.productionLines[0].machines[0].consumables[0].name, '冷卻濾芯（副本）');
    assert.equal(disk.productionLines[0].machines[0].consumables[1].plannedMaintenanceDate, '2027-03-15');
    await button('複製 精密研磨機').click();
    await label('產線名稱').fill('組裝二線');
    await button('建立產線').click(); await saved();
    await button('貼上機台').click(); await saved();
    assert.equal(await page.locator('.listItem.selected .itemMain strong').allTextContents().then(a => a.join('/')), '組裝二線/精密研磨機（副本）');
    // Native edit menu and keyboard clipboard use Electron's real roles.
    const menu = await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.find(i => i.label === '編輯').submenu.items.map(i => i.role));
    assert(menu.includes('copy') && menu.includes('paste'));
    await label('產線名稱').fill('中文連續輸入');
    await label('產線名稱').press('ControlOrMeta+A');
    await label('產線名稱').press('ControlOrMeta+C');
    await label('描述').click();
    await label('描述').press('ControlOrMeta+V');
    await page.screenshot({path: path.join(fixture, 'clipboard.png'), fullPage: true});
    assert.equal(await label('描述').inputValue(), '中文連續輸入');
    await label('產線名稱').fill(''); await label('描述').fill('');
    // Validate persisted data after opening the same file again.
    await page.reload();
    await page.getByRole('button', { name: /讀取預設存檔/ }).click();
    await button('上移 組裝二線').waitFor();
    assert.equal(await page.locator('.consumableTitle strong').first().textContent(), '冷卻濾芯（副本）');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('.consumableItem').filter({ hasText: 'FILTER-01' }).first().getByRole('button', { name: '編輯', exact: true }).click();
    await label('備註').fill('定期檢查密封圈');
    await label('備註').focus();
    const beforeSaveScroll = await page.evaluate(() => scrollY);
    await button('儲存耗材').click(); await saved();
    assert(await label('備註').evaluate(el => el === document.activeElement));
    assert(Math.abs(await page.evaluate(() => scrollY) - beforeSaveScroll) < 2, 'Saving moved the page');
    await label('產線名稱').focus();
    await page.keyboard.press('Tab');
    assert(await label('描述').evaluate(el => el === document.activeElement));
    const unnamed = await page.locator('button').evaluateAll(buttons => buttons.filter(b => !b.textContent.trim() && !b.getAttribute('aria-label')).length);
    assert.equal(unnamed, 0, 'Buttons must have accessible names');
    const layouts = [];
    for (const width of [1440, 1024, 768, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({ path: path.join(fixture, `workspace-${width}.png`), fullPage: true });
      layouts.push(await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth })));
    }
    assert(layouts.every(item => item.scrollWidth <= item.width), JSON.stringify(layouts));
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ fixture, layouts, errors, checks: ['real IPC save/reopen', 'date persistence', 'copy/paste hierarchy', 'ordering', 'input focus', 'native clipboard', 'save scroll stability', 'keyboard focus order', 'accessible button names', 'responsive overflow'] }, null, 2));
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy()));
    await app.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
