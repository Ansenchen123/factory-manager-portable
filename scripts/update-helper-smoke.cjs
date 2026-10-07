// Exercises the real Windows replacement helper using isolated executable fixtures.
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const powershell = path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function start(script, args, cwd) {
  const child = spawn(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, ...args], { cwd, windowsHide: true });
  let output = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  const done = new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', code => resolve({ code, output })); });
  return { child, done };
}
async function waitFor(file) {
  for (let i = 0; i < 100; i++) {
    if (await fs.stat(file).then(() => true, () => false)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${file}`);
}
(async () => {
  const root = path.resolve(__dirname, '..');
  const runtime = path.join(root, 'test-data/runtime');
  await fs.mkdir(runtime, { recursive: true });
  const fixture = await fs.mkdtemp(path.join(runtime, 'update-helper-'));
  const compiler = path.join(fixture, 'compile.ps1');
  await fs.writeFile(compiler, ['old', 'new'].map(name => `
Add-Type -TypeDefinition @'
using System;
using System.IO;
public class Fixture_${name} {
  public static void Main() { File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "launched.txt"), "${name}"); }
}
'@ -OutputAssembly '${name}.exe' -OutputType ConsoleApplication
`).join('\n'));
  const compiled = await start(compiler, [], fixture).done;
  assert.equal(compiled.code, 0, compiled.output);
  const oldBytes = await fs.readFile(path.join(fixture, 'old.exe'));
  const newBytes = await fs.readFile(path.join(fixture, 'new.exe'));
  for (const scenario of ['success', 'bad-hash', 'rollback', 'cancelled']) {
    const directory = path.join(fixture, `工廠 空白 ' ${scenario}`);
    const stage = path.join(directory, '.factory-update-test');
    await fs.mkdir(stage, { recursive: true });
    await fs.mkdir(path.join(directory, 'data'));
    await fs.writeFile(path.join(directory, 'data/factory-data.json'), '{"productionLines":[]}');
    const target = path.join(directory, '工廠管理.exe');
    await fs.writeFile(target, oldBytes);
    const payload = scenario === 'rollback' ? Buffer.from('invalid executable') : newBytes;
    await fs.writeFile(path.join(stage, 'update.exe'), payload);
    const parent = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { windowsHide: true, stdio: 'ignore' });
    const helperFile = path.join(stage, 'install.ps1');
    await fs.copyFile(path.join(root, 'assets/update-portable.ps1'), helperFile);
    const manifest = path.join(stage, 'update.json');
    await fs.writeFile(manifest, JSON.stringify({ target, processId: parent.pid, sha256: scenario === 'bad-hash' ? '0'.repeat(64) : hash(payload), version: '1.3.0' }));
    const helper = start(helperFile, ['-ManifestPath', manifest, '-Worker'], stage);
    try {
      if (scenario !== 'bad-hash') {
        await waitFor(path.join(stage, 'ready'));
        assert.equal(hash(await fs.readFile(target)), hash(oldBytes), 'Must wait until the parent exits');
        if (scenario !== 'cancelled') await fs.writeFile(path.join(stage, 'commit'), 'install');
      }
      parent.kill();
      const result = await helper.done;
      if (scenario === 'cancelled') {
        assert.equal(result.code, 0, result.output);
        assert.deepEqual(await fs.readFile(target), oldBytes);
        assert.equal(await fs.stat(path.join(directory, 'launched.txt')).then(() => true, () => false), false);
        continue;
      }
      const state = JSON.parse(await fs.readFile(path.join(stage, 'result.json'), 'utf8').then(text => text.replace(/^\uFEFF/, '')));
      assert.equal(result.code, scenario === 'success' ? 0 : 1, result.output);
      assert.equal(state.status, scenario === 'success' ? 'installed' : 'error');
      assert.equal(hash(await fs.readFile(target)), hash(scenario === 'success' ? newBytes : oldBytes));
      assert.equal(await fs.readFile(path.join(directory, 'data/factory-data.json'), 'utf8'), '{"productionLines":[]}');
      if (scenario !== 'bad-hash') {
        await waitFor(path.join(directory, 'launched.txt'));
        assert.equal(await fs.readFile(path.join(directory, 'launched.txt'), 'utf8'), scenario === 'success' ? 'new' : 'old');
      }
    } finally { parent.kill(); helper.child.kill(); }
  }
  console.log(JSON.stringify({ fixture, checks: ['waits for old process', 'replaces and restarts', 'Chinese/spaces/apostrophes in paths', 'retains factory data', 'rejects checksum mismatch', 'requires confirmed application exit', 'restores and launches old executable if launch fails'] }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
