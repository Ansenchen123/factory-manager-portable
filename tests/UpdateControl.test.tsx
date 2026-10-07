import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { UpdateControl } from '../src/UpdateControl';
import type { UpdateApi, UpdateState } from '../shared/updates';

const release = { version: '1.3.0', notes: '維護工作台更新', url: '', size: 10, sha256: '' };
const available: UpdateState = { status: 'available', currentVersion: '1.2.2', canInstall: true, release };
let listener: (state: UpdateState) => void;
let api: UpdateApi;
const onInstalling = vi.fn();
beforeEach(() => {
  onInstalling.mockClear();
  api = {
    getState: vi.fn(async () => available), check: vi.fn(async () => available),
    download: vi.fn(async (): Promise<UpdateState> => ({ ...available, status: 'ready' })), install: vi.fn(async () => {}),
    openRelease: vi.fn(async () => {}), onState: vi.fn(callback => { listener = callback; return vi.fn(); }),
  };
  window.appUpdates = api;
});
afterEach(() => { delete window.appUpdates; });

it('automatically shows release notes, then downloads and installs only when clicked', async () => {
  const user = userEvent.setup();
  render(<UpdateControl blocked={false} onInstalling={onInstalling} />);
  expect(await screen.findByText('維護工作台更新')).toBeInTheDocument();
  expect(api.download).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: '下載並更新' }));
  expect(api.download).toHaveBeenCalledTimes(1);
  expect(api.install).toHaveBeenCalledTimes(1);
});
it('blocks update while there are drafts or a pending save', async () => {
  render(<UpdateControl blocked onInstalling={onInstalling} />);
  expect(await screen.findByRole('button', { name: '下載並更新' })).toBeDisabled();
  expect(api.install).not.toHaveBeenCalled();
});
it('keeps downloaded update ready if a draft is entered during download', async () => {
  let finish!: (state: UpdateState) => void;
  vi.mocked(api.download).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const user = userEvent.setup();
  const view = render(<UpdateControl blocked={false} onInstalling={onInstalling} />);
  await user.click(await screen.findByRole('button', { name: '下載並更新' }));
  view.rerender(<UpdateControl blocked onInstalling={onInstalling} />);
  await act(async () => { const ready: UpdateState = { ...available, status: 'ready' }; listener(ready); finish(ready); });
  expect(api.install).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: '重新啟動更新' })).toBeDisabled();
  view.rerender(<UpdateControl blocked={false} onInstalling={onInstalling} />);
  await user.click(screen.getByRole('button', { name: '重新啟動更新' }));
  expect(api.install).toHaveBeenCalledTimes(1);
  expect(api.download).toHaveBeenCalledTimes(1);
});
it('leaves the app running after a download error and can retry checking', async () => {
  vi.mocked(api.download).mockImplementation(async () => {
    const failed: UpdateState = { ...available, status: 'error', message: '更新檔案驗證失敗' };
    listener(failed); return failed;
  });
  const user = userEvent.setup();
  render(<UpdateControl blocked={false} onInstalling={onInstalling} />);
  await user.click(await screen.findByRole('button', { name: '下載並更新' }));
  expect(screen.getByRole('status')).toHaveTextContent('驗證失敗');
  expect(api.install).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: '檢查更新' }));
  expect(api.check).toHaveBeenCalledTimes(1);
});
it('unlocks the interface if the main process cancels restart', async () => {
  render(<UpdateControl blocked={false} onInstalling={onInstalling} />);
  await screen.findByText('維護工作台更新');
  act(() => listener({ ...available, status: 'installing' }));
  expect(onInstalling).toHaveBeenLastCalledWith(true);
  act(() => listener({ ...available, status: 'ready', message: '請先儲存再更新' }));
  expect(onInstalling).toHaveBeenLastCalledWith(false);
});
it('offers the official download page for non-portable builds', async () => {
  vi.mocked(api.getState).mockResolvedValue({ ...available, canInstall: false });
  const user = userEvent.setup();
  render(<UpdateControl blocked={false} onInstalling={onInstalling} />);
  await user.click(await screen.findByRole('button', { name: '下載可攜版' }));
  expect(api.openRelease).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: '下載並更新' })).not.toBeInTheDocument();
});
it('ignores a stale initial state after receiving a newer update event', async () => {
  let finish!: (state: UpdateState) => void;
  vi.mocked(api.getState).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  render(<UpdateControl blocked={false} onInstalling={onInstalling} />);
  act(() => listener(available));
  await act(async () => finish({ ...available, status: 'current', release: undefined }));
  await waitFor(() => expect(screen.getByText('維護工作台更新')).toBeInTheDocument());
});
