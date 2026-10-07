import { useEffect, useRef, useState } from 'react';
import type { UpdateState } from '../shared/updates';

export function UpdateControl({ blocked, onInstalling }: { blocked: boolean; onInstalling: (value: boolean) => void }) {
  const [state, setState] = useState<UpdateState>();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const blockedRef = useRef(blocked);
  blockedRef.current = blocked;
  useEffect(() => {
    const api = window.appUpdates;
    if (!api) return;
    let alive = true;
    let received = false;
    const off = api.onState(next => {
      received = true;
      setState(next);
      if (next.status === 'available') setOpen(true);
      onInstalling(next.status === 'installing');
    });
    void api.getState().then(next => {
      if (alive && !received) { setState(next); if (next.status === 'available') setOpen(true); }
    }).catch(() => { if (alive) setError('無法讀取更新狀態。'); });
    return () => { alive = false; off(); };
  }, [onInstalling]);
  if (!window.appUpdates || !state) return null;
  const busy = ['checking', 'downloading', 'installing'].includes(state.status);
  const available = Boolean(state.release);
  async function run(action: 'check' | 'update') {
    setError('');
    try {
      if (action === 'check') { await window.appUpdates!.check(); return; }
      if (blockedRef.current) return;
      const downloaded = state!.status === 'ready' ? state! : await window.appUpdates!.download();
      if (downloaded.status === 'ready' && !blockedRef.current) {
        onInstalling(true);
        await window.appUpdates!.install();
      }
    } catch { onInstalling(false); setError('更新未完成，請重試。'); }
  }
  return <div className="updateControl">
    <button type="button" className="secondaryButton compact" onClick={() => setOpen(!open)} aria-expanded={open}>
      {state.status === 'downloading' ? `下載更新 ${state.percent ?? 0}%` : available ? `新版 ${state.release!.version}` : `版本 ${state.currentVersion}`}
    </button>
    {open && <section className="updatePopover" aria-label="軟體更新">
      <strong>軟體更新</strong>
      <p>目前版本 {state.currentVersion}</p>
      {available && <><p>新版 {state.release!.version}</p><pre className="releaseNotes">{state.release!.notes || '此版本未提供更新說明。'}</pre></>}
      <p role="status">{error || state.message || ({
        idle: '啟動時自動檢查正式版本。', checking: '正在檢查更新…', current: '目前已是最新版本。',
        available: '更新後自動重啟，工廠存檔保留原位。', downloading: `下載中 ${state.percent ?? 0}%`,
        ready: '下載完成，可重新啟動套用更新。', installing: '正在關閉程式並套用更新…', error: '更新失敗，請重試。',
      }[state.status])}</p>
      {blocked && available && <p>請先儲存或取消編輯，並等待存檔完成後再更新。</p>}
      <div className="formActions">
        <button type="button" className="secondaryButton compact" disabled={busy} onClick={() => void run('check')}>檢查更新</button>
        {available && state.canInstall && <button type="button" className="primaryButton compact" disabled={busy || blocked} onClick={() => void run('update')}>
          {state.status === 'ready' ? '重新啟動更新' : '下載並更新'}
        </button>}
        {!state.canInstall && <button type="button" className="secondaryButton compact" onClick={() => void window.appUpdates!.openRelease().catch(() => setError('無法開啟下載頁面。'))}>下載可攜版</button>}
      </div>
      {!state.canInstall && <p>自動替換適用於 Windows x64 單檔可攜版。</p>}
    </section>}
  </div>;
}
