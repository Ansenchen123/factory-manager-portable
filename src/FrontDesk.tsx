import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { dueLabel, dueTone, getMaintenanceInfo, localDateString, parseCalendarDate } from '../shared/maintenance';
import type { FactoryData } from '../shared/schema';

type Props = {
  data: FactoryData;
  today: string;
  busy: boolean;
  onComplete: (itemId: string, lineId: string, machineId: string) => void;
};

export function FrontDesk({ data, today, busy, onComplete }: Props) {
  const [query, setQuery] = useState('');
  const board = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const focusAfterSave = useRef<{ source: HTMLInputElement; next?: HTMLInputElement }>(null);
  useEffect(() => {
    const pending = focusAfterSave.current;
    if (busy || !pending) return;
    if (!pending.source.isConnected && document.activeElement === document.body) {
      (pending.next?.isConnected ? pending.next : search.current)?.focus();
    }
    focusAfterSave.current = null;
  }, [data, busy]);

  const entries = data.productionLines.flatMap(line => line.machines.flatMap(machine =>
    machine.consumables.map(item => ({ line, machine, item, info: getMaintenanceInfo(item, parseCalendarDate(today)!) })),
  )).sort((a, b) => a.info.daysRemaining - b.info.daysRemaining);
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matches = entries.filter(({ line, machine, item }) => {
    const text = [line.name, machine.name, machine.code, item.name, item.sku].join(' ').toLocaleLowerCase();
    return terms.every(term => text.includes(term));
  });
  const overdue = entries.filter(entry => entry.info.daysRemaining < 0);
  const dueToday = entries.filter(entry => entry.info.daysRemaining === 0);
  const upcoming = entries.filter(entry => entry.info.daysRemaining > 0 && entry.info.daysRemaining <= 7);

  // Rows stay in urgency order; each machine heads its rows once, at its most urgent item.
  function byMachine(rows: typeof entries) {
    const groups = new Map<string, typeof entries>();
    for (const row of rows) {
      const key = JSON.stringify([row.line.id, row.machine.id]);
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return [...groups.entries()];
  }

  function list(title: string, id: string, rows: typeof entries, empty: string, className = '') {
    return <section className={`taskSection ${className}`} aria-labelledby={id}>
      <div className="taskSectionHeader">
        <h2 id={id}>{title} <span className="taskCount">{rows.length}</span></h2>
      </div>
      {rows.length === 0 ? <p className="taskEmpty">{empty}</p> : <ul className="taskGroups">
        {byMachine(rows).map(([key, group]) => {
          const { line, machine } = group[0];
          return <li className="taskGroup" key={key}>
            <div className="taskGroupHeader">
              <p className="taskLocation">{`產線：${line.name} → 機台：${machine.name}`}</p>
              {(machine.code || machine.location) && <p className="taskMeta">
                {machine.code && <span>機台編號 {machine.code}</span>}
                {machine.location && <span>位置 {machine.location}</span>}
              </p>}
            </div>
            <ul className="taskList">{group.map(row)}</ul>
          </li>;
        })}
      </ul>}
    </section>;
  }

  function row({ line, machine, item, info }: (typeof entries)[number]) {
    const done = Boolean(item.lastMaintainedAt && localDateString(new Date(item.lastMaintainedAt)) === today && info.daysRemaining > 0);
    return <li className="taskRow" key={item.id}>
      <div className="taskDetails">
        <div className="taskTitle">
          <h3>{item.name}</h3>
          <span className={`statusPill ${dueTone(info.daysRemaining)}`}>{dueLabel(info.daysRemaining)}</span>
        </div>
        <p className="taskMeta">
          {item.sku && <span>料號 {item.sku}</span>}
          <span>{item.plannedMaintenanceDate ? '預定維護' : '下次維護'} {localDateString(info.nextMaintenanceDate).replaceAll('-', '/')}</span>
        </p>
        {item.notes && <p className="taskNotes">{item.notes}</p>}
      </div>
      <label className={`completionCheck${done ? ' isComplete' : ''}`}>
        <input type="checkbox" checked={done} disabled={busy || done}
          aria-label={`完成 ${line.name} / ${machine.name} / ${item.name}`}
          onChange={event => {
            const controls = [...(board.current?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:not(:disabled)') ?? [])];
            const index = controls.indexOf(event.currentTarget);
            focusAfterSave.current = { source: event.currentTarget, next: controls[index + 1] ?? controls[index - 1] };
            onComplete(item.id, line.id, machine.id);
          }} />
        <span>{done ? '今日已完成' : '完成'}</span>
      </label>
    </li>;
  }

  return <div className="frontDesk" ref={board} aria-busy={busy}>
    <div className="maintenanceSearch" role="search">
      <label htmlFor="maintenance-search">搜尋維護條目</label>
      <div className="searchField">
        <Search size={20} aria-hidden="true" />
        <input id="maintenance-search" ref={search} type="search" value={query}
          onChange={event => setQuery(event.target.value)} placeholder="產線、機台、耗材名稱或料號" />
        {query && <button type="button" className="secondaryButton compact" onClick={() => { setQuery(''); search.current?.focus(); }}>清除搜尋</button>}
      </div>
      <p>搜尋涵蓋所有耗材，也可提前完成維護。勾選後自動儲存，15 秒內可復原。</p>
    </div>
    {entries.length === 0 && <p className="emptyState">尚無耗材，請至右上角「後台管理」建立產線、機台與耗材。</p>}
    {terms.length > 0 ? list('搜尋結果', 'search-results-heading', matches, '找不到符合的條目，請換個關鍵字。') : <div className="taskSections">
      {list('已逾期', 'overdue-heading', overdue, '目前沒有逾期項目。')}
      {list('今天需要維護', 'today-heading', dueToday, '今天沒有待維護項目。')}
      {list('即將到期（7 天內）', 'upcoming-heading', upcoming, '未來 7 天沒有到期項目。', 'upcomingSection')}
    </div>}
  </div>;
}
