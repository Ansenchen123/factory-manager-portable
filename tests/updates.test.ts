// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { selectRelease, downloadRelease, isNewerVersion } from '../electron/updateFiles';

const bytes = Buffer.from('MZ test update');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const url = 'https://github.com/Ansenchen123/factory-manager-portable/releases/download/v1.3.0/Factory.Manager.Portable.1.3.0.exe';
const release = { version: '1.3.0', notes: '更新內容', url, size: bytes.length, sha256 };
const metadata = () => ({ tag_name: 'v1.3.0', draft: false, prerelease: false, body: '更新內容', assets: [
  { name: 'Factory.Manager.Portable.1.3.0.exe', browser_download_url: url, size: bytes.length, digest: `sha256:${sha256}`, state: 'uploaded' },
] });
const dirs: string[] = [];
afterEach(async () => { for (const dir of dirs.splice(0)) await fs.rm(dir, { recursive: true, force: true }); });

describe('portable updates', () => {
  it('compares numeric versions and accepts a stable release after the same test version', () => {
    expect(isNewerVersion('1.10.0', '1.9.9')).toBe(true);
    expect(isNewerVersion('1.3.0', '1.3.0-test.1')).toBe(true);
    expect(isNewerVersion('1.3.0', '1.3.0')).toBe(false);
    expect(isNewerVersion('1.2.2', '1.3.0-test.1')).toBe(false);
  });
  it('selects only the expected official portable asset with a checksum', () => {
    expect(selectRelease(metadata(), '1.2.2')).toEqual(release);
    expect(selectRelease(metadata(), '1.3.0')).toBeUndefined();
    expect(selectRelease({ ...metadata(), prerelease: true }, '1.2.2')).toBeUndefined();
    expect(selectRelease({ ...metadata(), draft: true }, '1.2.2')).toBeUndefined();
    for (const change of [{ digest: null }, { browser_download_url: 'https://evil.example/update.exe' },
      { name: 'Setup.exe' }, { size: 0 }, { state: 'new' }]) {
      const value = metadata(); Object.assign(value.assets[0], change);
      expect(() => selectRelease(value, '1.2.2')).toThrow();
    }
  });
  it('rejects malformed metadata and prerelease tags even when marked stable', () => {
    expect(() => selectRelease({}, '1.2.2')).toThrow();
    expect(() => selectRelease({ ...metadata(), tag_name: 'v1.3.0-test.1' }, '1.2.2')).toThrow();
  });
  async function directory() {
    const root = fileURLToPath(new URL('../test-data/runtime/', import.meta.url));
    await fs.mkdir(root, { recursive: true });
    const dir = await fs.mkdtemp(path.join(root, 'update-test-')); dirs.push(dir); return dir;
  }
  it('downloads and verifies the entire file before making it installable', async () => {
    const dir = await directory(); const progress: number[] = [];
    const file = await downloadRelease(release, dir, async () => new Response(bytes), n => progress.push(n));
    expect(await fs.readFile(file)).toEqual(bytes);
    expect(progress.at(-1)).toBe(100);
    expect(await fs.readdir(dir)).toEqual(['update.exe']);
  });
  it('rejects corrupted, truncated, oversized and failed downloads without leaving an executable', async () => {
    for (const response of [new Response(Buffer.alloc(bytes.length)), new Response('MZ'),
      new Response(Buffer.concat([bytes, bytes])), new Response('error', { status: 500 })]) {
      const dir = await directory();
      await expect(downloadRelease(release, dir, async () => response, () => {})).rejects.toThrow();
      expect(await fs.readdir(dir)).toEqual([]);
    }
  });
});
