import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { UpdateRelease } from '../shared/updates';

export const releasePage = 'https://github.com/Ansenchen123/factory-manager-portable/releases/latest';
export const releaseApi = 'https://api.github.com/repos/Ansenchen123/factory-manager-portable/releases/latest';
const stable = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function isNewerVersion(next: string, current: string): boolean {
  if (!stable.test(next) || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[\w.-]+)?$/.test(current)) throw new Error('版本格式無效。');
  const left = next.split('.').map(Number);
  const right = current.split('-')[0].split('.').map(Number);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] > right[i];
  return current.includes('-');
}

const releaseSchema = z.object({
  tag_name: z.string(), draft: z.boolean(), prerelease: z.boolean(), body: z.string().nullable(),
  assets: z.array(z.object({ name: z.string(), browser_download_url: z.string(), size: z.number(), digest: z.string().nullable().optional(), state: z.string() })),
});

export function selectRelease(value: unknown, currentVersion: string): UpdateRelease | undefined {
  const metadata = releaseSchema.parse(value);
  if (metadata.draft || metadata.prerelease) return;
  const version = metadata.tag_name.replace(/^v/, '');
  if (!isNewerVersion(version, currentVersion)) return;
  const name = `Factory.Manager.Portable.${version}.exe`;
  const url = `https://github.com/Ansenchen123/factory-manager-portable/releases/download/${metadata.tag_name}/${name}`;
  const asset = metadata.assets.find(item => item.name === name && item.state === 'uploaded');
  if (!asset || asset.browser_download_url !== url || !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > 512 * 1024 * 1024
    || !asset.digest?.match(/^sha256:[a-f0-9]{64}$/)) throw new Error('新版安裝檔尚未備妥或缺少驗證碼，請稍後再試。');
  return { version, notes: metadata.body ?? '', url, size: asset.size, sha256: asset.digest.slice(7) };
}

export async function downloadRelease(release: UpdateRelease, directory: string,
  fetcher: typeof fetch, progress: (percent: number) => void): Promise<string> {
  const partial = path.join(directory, 'update.part');
  const destination = path.join(directory, 'update.exe');
  try {
    const response = await fetcher(release.url, { signal: AbortSignal.timeout(10 * 60_000) });
    if (!response.ok || !response.body) throw new Error('更新下載失敗，請檢查網路後重試。');
    const hash = createHash('sha256');
    const file = await fs.open(partial, 'wx');
    let count = 0;
    try {
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        count += chunk.length;
        if (count > release.size) throw new Error('更新檔案大小不符。');
        hash.update(chunk);
        await file.writeFile(chunk);
        progress(Math.min(99, Math.floor(count / release.size * 100)));
      }
    } finally { await file.close(); }
    if (count !== release.size || hash.digest('hex') !== release.sha256) throw new Error('更新檔案驗證失敗，請重新下載。');
    await fs.rename(partial, destination);
    progress(100);
    return destination;
  } catch (error) {
    await fs.rm(partial, { force: true });
    throw error;
  }
}
