// Run with the renderer dev server on port 5173 after npm run build.
// Playwright must be resolvable (or set NODE_PATH).
const { _electron: electron } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const root = path.resolve(__dirname, '..');
  const runtime = path.join(root, 'test-data', 'runtime');
  await fs.mkdir(runtime, { recursive: true });
  const fixture = await fs.mkdtemp(path.join(runtime, 'factory-drag-'));
  const timestamp = '2026-09-08T00:00:00.000Z';
  const dates = { createdAt: timestamp, updatedAt: timestamp };
  const machine = (id, consumables = []) => ({ id, name: id, ...dates, consumables });
  const data = { schemaVersion: 1, updatedAt: timestamp, productionLines: [
    { id: 'a', name: 'A線', ...dates, machines: [machine('M1', [{ id: 'c', name: '濾芯', maintenanceIntervalDays: 30, ...dates, lastMaintainedAt: timestamp }]), machine('M2')] },
    { id: 'b', name: 'B線', ...dates, machines: [] },
  ] };
  await fs.mkdir(path.join(fixture, 'data'));
  const file = path.join(fixture, 'data/factory-data.json');
  await fs.writeFile(file, JSON.stringify(data));
  const executable = process.env.FACTORY_SMOKE_EXE;
  const app = await electron.launch({ executablePath: executable || require('electron'), args: [...(executable ? [] : [root]), `--user-data-dir=${path.join(fixture, 'profile')}`], cwd: fixture,
    env: { ...process.env, PORTABLE_EXECUTABLE_DIR: fixture } });
  try {
    const page = await app.firstWindow();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const card = name => page.locator('article.listItem:not(.dragPreview)').filter({ has: page.locator('strong').getByText(name, { exact: true }) });
    const selected = async name => assert(await card(name).locator('.itemMain').getAttribute('aria-pressed') === 'true', `${name} not selected`);
    const saved = () => page.locator('.workspaceGrid[aria-busy="false"]').waitFor();
    const read = async () => JSON.parse(await fs.readFile(file, 'utf8'));
    await page.getByRole('button', { name: /讀取預設存檔/ }).click();
    await card('A線').waitFor();
    const row = card('B線').locator('.itemActions');
    const box = await row.boundingBox();
    await row.click({ position: { x: box.width - 4, y: box.height / 2 } });
    await selected('B線');
    await page.getByRole('button', { name: '編輯 A線', exact: true }).click();
    await selected('A線');
    await page.locator('#line-form').getByRole('button', { name: '取消', exact: true }).click();
    // Real mouse dragging from the title area, with no synthetic drag events.
    async function drag(name, target, position = 'after', screenshot) {
      await card(target).scrollIntoViewIfNeeded();
      await card(name).scrollIntoViewIfNeeded();
      const from = await card(name).locator('.itemMain').boundingBox();
      const to = await card(target).boundingBox();
      await page.mouse.move(from.x + 20, from.y + 15);
      await page.mouse.down();
      await page.mouse.move(from.x + 25, from.y + 25, { steps: 5 });
      const y = to.y + (position === 'before' ? 4 : to.height - 4);
      await page.mouse.move(to.x + to.width / 2, y, { steps: 15 });
      await page.mouse.move(to.x + to.width / 2, y, { steps: 2 });
      const preview = page.locator('.dragPreview');
      assert.equal(await preview.count(), 1);
      const appearance = await preview.evaluate(element => ({ opacity: getComputedStyle(element).opacity, pointerEvents: getComputedStyle(element).pointerEvents, hidden: element.getAttribute('aria-hidden') }));
      assert.deepEqual(appearance, { opacity: '0.8', pointerEvents: 'none', hidden: 'true' });
      if (screenshot) await page.screenshot({ path: path.join(fixture, screenshot) });
      await page.mouse.up();
      await saved();
      assert.equal(await preview.count(), 0, 'Preview must disappear after drop');
    }
    await drag('A線', 'B線', 'after', 'drop-after.png');
    assert.deepEqual((await read()).productionLines.map(line => line.id), ['b', 'a']);
    await selected('A線');
    await drag('M1', 'M2');
    assert.deepEqual((await read()).productionLines[1].machines.map(item => item.id), ['M2', 'M1']);
    await drag('M1', 'M2', 'before');
    assert.deepEqual((await read()).productionLines[1].machines.map(item => item.id), ['M1', 'M2']);
    await drag('M1', 'B線', 'after', 'drop-into.png');
    await selected('B線');
    await selected('M1');
    const moved = await read();
    assert.deepEqual(moved.productionLines[0].machines[0].consumables, data.productionLines[0].machines[0].consumables);
    assert.deepEqual(moved.productionLines[1].machines.map(item => item.id), ['M2']);
    await page.reload();
    await page.getByRole('button', { name: /讀取預設存檔/ }).click();
    await card('M1').waitFor();
    await selected('B線');
    await card('M1').scrollIntoViewIfNeeded();
    const cancelSource = await card('M1').locator('.itemMain').boundingBox();
    await page.mouse.move(cancelSource.x + 20, cancelSource.y + 15);
    await page.mouse.down();
    await page.mouse.move(cancelSource.x + 50, cancelSource.y + 45, { steps: 8 });
    await page.locator('.dragPreview').waitFor();
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await page.locator('.dragPreview').waitFor({ state: 'detached' });
    assert.deepEqual(await read(), moved, 'Cancelling drag must not change the saved data');
    await page.screenshot({ path: path.join(fixture, 'result.png'), fullPage: true });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ fixture, checks: ['action-row hit testing', 'edit selects card', 'line drag', 'machine drag both directions', '80% custom preview', 'preview cleanup on drop and Escape', 'cross-line transfer preserves history', 'real IPC save and reopen'], errors }, null, 2));
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy()));
    await app.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
