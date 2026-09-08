import { ItemTools } from './ItemTools';
import { copyItem, moveItem } from '../shared/items';
import { CheckCircle2, Edit3, FileJson, FolderOpen, Plus, Save, Trash2, Wrench } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { getMaintenanceInfo, localDateString, parseCalendarDate, markConsumableMaintained, type MaintenanceStatus } from '../shared/maintenance';
import type { Consumable, FactoryData, Machine, ProductionLine } from '../shared/schema';
import { createEmptyFactoryData } from '../shared/schema';

type FactoryDataSession = {
  data: FactoryData;
  path: string;
};

type LineForm = {
  id?: string;
  name: string;
  description: string;
};

type MachineForm = {
  id?: string;
  name: string;
  code: string;
  model: string;
  location: string;
};

type ConsumableForm = {
  id?: string;
  name: string;
  sku: string;
  maintenanceIntervalDays: string;
  notes: string;
  lastMaintainedDate: string;
  plannedMaintenanceDate: string;
};

const emptyLineForm: LineForm = { name: '', description: '' };
const emptyMachineForm: MachineForm = { name: '', code: '', model: '', location: '' };
const emptyConsumableForm: ConsumableForm = { name: '', sku: '', maintenanceIntervalDays: '30', notes: '', lastMaintainedDate: '', plannedMaintenanceDate: '' };

function lineFields(line?: ProductionLine): LineForm {
  return line ? { id: line.id, name: line.name, description: line.description ?? '' } : emptyLineForm;
}

function machineFields(machine?: Machine): MachineForm {
  return machine ? { id: machine.id, name: machine.name, code: machine.code ?? '', model: machine.model ?? '', location: machine.location ?? '' } : emptyMachineForm;
}

function consumableFields(item?: Consumable): ConsumableForm {
  return item ? { id: item.id, name: item.name, sku: item.sku ?? '', maintenanceIntervalDays: String(item.maintenanceIntervalDays), notes: item.notes ?? '',
    lastMaintainedDate: item.lastMaintainedAt ? localDateString(new Date(item.lastMaintainedAt)) : '', plannedMaintenanceDate: item.plannedMaintenanceDate ?? '' } : emptyConsumableForm;
}

function focusForm(id: string) {
  requestAnimationFrame(() => document.getElementById(id)?.querySelector('input')?.focus());
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function formatDate(value?: string | Date): string {
  if (!value) {
    return '尚未維護';
  }

  return localDateString(new Date(value)).replaceAll('-', '/');
}

function statusLabel(status: MaintenanceStatus, daysRemaining: number): string {
  if (status === 'due') {
    return daysRemaining < 0 ? `逾期 ${Math.abs(daysRemaining)} 日` : '今日到期';
  }

  if (status === 'soon') {
    return `${daysRemaining} 日內到期`;
  }

  return `${daysRemaining} 日後`;
}

function statusTone(status: MaintenanceStatus): string {
  return {
    ok: 'statusOk',
    soon: 'statusSoon',
    due: 'statusDue',
  }[status];
}

function findSelectedLine(data: FactoryData, selectedLineId?: string): ProductionLine | undefined {
  return data.productionLines.find((line) => line.id === selectedLineId) ?? data.productionLines[0];
}

function findSelectedMachine(line?: ProductionLine, selectedMachineId?: string): Machine | undefined {
  return line?.machines.find((machine) => machine.id === selectedMachineId) ?? line?.machines[0];
}

export function App() {
  const [data, setData] = useState<FactoryData>(() => createEmptyFactoryData());
  const [dataPath, setDataPath] = useState('');
  const [selectedLineId, setSelectedLineId] = useState<string>();
  const [selectedMachineId, setSelectedMachineId] = useState<string>();
  const [lineForm, setLineForm] = useState<LineForm>(emptyLineForm);
  const [machineForm, setMachineForm] = useState<MachineForm>(emptyMachineForm);
  const [consumableForm, setConsumableForm] = useState<ConsumableForm>(emptyConsumableForm);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const saving = useRef(false);
  const composing = useRef(false);
  const [clipboard, setClipboard] = useState<{ kind: 'line' | 'machine' | 'consumable'; item: ProductionLine | Machine | Consumable }>();
  const lineHasDraft = JSON.stringify(lineForm) !== JSON.stringify(lineFields(data.productionLines.find(line => line.id === lineForm.id)));
  const machines = data.productionLines.flatMap(line => line.machines);
  const machineHasDraft = JSON.stringify(machineForm) !== JSON.stringify(machineFields(machines.find(machine => machine.id === machineForm.id)));
  const consumableHasDraft = JSON.stringify(consumableForm) !== JSON.stringify(consumableFields(machines.flatMap(machine => machine.consumables).find(item => item.id === consumableForm.id)));
  const hasDraft = lineHasDraft || machineHasDraft || consumableHasDraft;
  // Save callbacks must consider drafts typed after the write began.
  const latestDrafts = useRef({ machine: machineHasDraft, consumable: consumableHasDraft });
  latestDrafts.current = { machine: machineHasDraft, consumable: consumableHasDraft };
  const [today, setToday] = useState(localDateString());
  useEffect(() => {
    const timer = window.setInterval(() => setToday(localDateString()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(''), 6000);
    return () => window.clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (hasDraft || saving.current) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasDraft]);


  const hasSession = Boolean(dataPath);
  const selectedLine = useMemo(() => findSelectedLine(data, selectedLineId), [data, selectedLineId]);
  const selectedMachine = useMemo(
    () => findSelectedMachine(selectedLine, selectedMachineId),
    [selectedLine, selectedMachineId],
  );

  const allConsumables = data.productionLines.flatMap((line) =>
    line.machines.flatMap((machine) => machine.consumables),
  );
  const dueCount = allConsumables.filter((consumable) => getMaintenanceInfo(consumable, parseCalendarDate(today)!).status === 'due').length;
  const soonCount = allConsumables.filter((consumable) => getMaintenanceInfo(consumable, parseCalendarDate(today)!).status === 'soon').length;

  function applySession(session: FactoryDataSession, nextMessage: string) {
    setData(session.data);
    setDataPath(session.path);
    setClipboard(undefined);
    setSelectedLineId(session.data.productionLines[0]?.id);
    setSelectedMachineId(session.data.productionLines[0]?.machines[0]?.id);
    setLineForm(emptyLineForm);
    setMachineForm(emptyMachineForm);
    setConsumableForm(emptyConsumableForm);
    setMessage(nextMessage);
    setError('');
  }

  async function runSessionAction(action: () => Promise<FactoryDataSession | null>, nextMessage: string) {
    if (saving.current || (hasDraft && !window.confirm('有尚未儲存的內容。捨棄變更並切換存檔？'))) return;
    if (!window.factoryData) {
      setError('請開啟桌面版以讀取或儲存資料。');
      return;
    }

    saving.current = true;
    setIsBusy(true);
    setError('');
    try {
      const session = await action();
      if (session) {
        applySession(session, nextMessage);
      }
    } catch (sessionError) {
      setError('無法開啟存檔。請確認檔案為有效的工廠管理存檔，且所在位置可讀寫。');
    } finally {
      saving.current = false;
      setIsBusy(false);
    }
  }

  async function persist(nextData: FactoryData, successMessage: string, onSuccess?: () => void) {
    if (saving.current) return;
    saving.current = true;
    setIsBusy(true);
    setError('');

    try {
      const session = await window.factoryData.save(nextData);
      setData(session.data);
      setDataPath(session.path);
      setMessage(successMessage);
      onSuccess?.();
    } catch (saveError) {
      setError('儲存失敗，輸入內容已保留。請確認存檔位置可寫入後重試。');
    } finally {
      saving.current = false;
      setIsBusy(false);
    }
  }

  function updateData(mutator: (current: FactoryData, timestamp: string) => FactoryData, successMessage: string, onSuccess?: () => void) {
    if (saving.current || composing.current) return;
    const timestamp = nowIso();
    const nextData = mutator(data, timestamp);
    void persist(nextData, successMessage, onSuccess);
  }

  function move(kind: 'line' | 'machine' | 'consumable', id: string, direction: -1 | 1) {
    updateData((current, timestamp) => ({ ...current, updatedAt: timestamp,
      productionLines: kind === 'line' ? moveItem(current.productionLines, id, direction) : current.productionLines.map(line =>
        line.id !== selectedLine?.id ? line : { ...line, updatedAt: timestamp,
          machines: kind === 'machine' ? moveItem(line.machines, id, direction) : line.machines.map(machine =>
            machine.id !== selectedMachine?.id ? machine : { ...machine, updatedAt: timestamp,
              consumables: moveItem(machine.consumables, id, direction) }) })
    }), '排列順序已儲存。');
  }

  function paste(kind: 'line' | 'machine' | 'consumable') {
    if (!clipboard || clipboard.kind !== kind || (kind === 'machine' && !selectedLine) || (kind === 'consumable' && !selectedMachine)) return;
    updateData((current, timestamp) => {
      const item = copyItem(clipboard.item, timestamp, newId);
      item.name += '（副本）';
      return { ...current, updatedAt: timestamp,
        productionLines: kind === 'line' ? [...current.productionLines, item as ProductionLine] : current.productionLines.map(line =>
          line.id !== selectedLine?.id ? line : { ...line, updatedAt: timestamp,
            machines: kind === 'machine' ? [...line.machines, item as Machine] : line.machines.map(machine =>
              machine.id !== selectedMachine?.id ? machine : { ...machine, updatedAt: timestamp, consumables: [...machine.consumables, item as Consumable] }) }) };
    }, '副本已建立。維護日期請依實際情況設定。');
  }

  function itemTools(kind: 'line' | 'machine' | 'consumable', item: ProductionLine | Machine | Consumable, index: number, count: number) {
    return <ItemTools name={item.name} index={index} count={count} busy={isBusy}
      onMove={direction => move(kind, item.id, direction)}
      onCopy={() => { setClipboard({ kind, item: structuredClone(item) }); setError(''); setMessage(`已複製「${item.name}」。請選擇目的位置後貼上；副本不含維護日期。`); }} />;
  }

  function pasteButton(kind: 'line' | 'machine' | 'consumable', label: string) {
    return <button className="secondaryButton compact" type="button" disabled={isBusy || clipboard?.kind !== kind || (kind === 'machine' && !selectedLine) || (kind === 'consumable' && !selectedMachine)}
      title={clipboard?.kind === kind ? `貼上「${clipboard.item.name}」` : `先複製${label}`}
      onClick={() => paste(kind)}>貼上{label}</button>;
  }

  function selectLine(line: ProductionLine) {
    if (line.id === selectedLine?.id) return;
    if ((machineHasDraft || consumableHasDraft) && !window.confirm('切換產線會捨棄尚未儲存的機台與耗材內容。繼續切換？')) return;
    setSelectedLineId(line.id);
    setSelectedMachineId(line.machines[0]?.id);
    setMachineForm(emptyMachineForm);
    setConsumableForm(emptyConsumableForm);
  }

  function selectMachine(machine: Machine) {
    if (machine.id === selectedMachine?.id) return;
    if (consumableHasDraft && !window.confirm('切換機台會捨棄尚未儲存的耗材內容。繼續切換？')) return;
    setSelectedMachineId(machine.id);
    setConsumableForm(emptyConsumableForm);
  }

  function submitLine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current || composing.current) return;
    const newLineId = newId();
    const name = lineForm.name.trim();

    if (!name) {
      setError('產線名稱為必填。');
      return;
    }

    updateData((current, timestamp) => {
      if (lineForm.id) {
        return {
          ...current,
          productionLines: current.productionLines.map((line) =>
            line.id === lineForm.id
              ? { ...line, name, description: lineForm.description.trim() || undefined, updatedAt: timestamp }
              : line,
          ),
          updatedAt: timestamp,
        };
      }

      const line: ProductionLine = {
        id: newLineId,
        name,
        description: lineForm.description.trim() || undefined,
        machines: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      return {
        ...current,
        productionLines: [...current.productionLines, line],
        updatedAt: timestamp,
      };
    }, lineForm.id ? '產線已更新。' : '產線已建立。', () => {
      if (!lineForm.id && !latestDrafts.current.machine && !latestDrafts.current.consumable) {
        setSelectedLineId(newLineId);
        setSelectedMachineId(undefined);
        setMachineForm(emptyMachineForm);
        setConsumableForm(emptyConsumableForm);
      }
      setLineForm(current => current === lineForm ? emptyLineForm : current);
    });
  }

  function submitMachine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedLine) {
      setError('請先建立或選擇產線。');
      return;
    }

    if (saving.current || composing.current) return;
    const newMachineId = newId();
    const name = machineForm.name.trim();
    if (!name) {
      setError('機台名稱為必填。');
      return;
    }

    updateData((current, timestamp) => ({
      ...current,
      productionLines: current.productionLines.map((line) => {
        if (line.id !== selectedLine.id) {
          return line;
        }

        if (machineForm.id) {
          return {
            ...line,
            machines: line.machines.map((machine) =>
              machine.id === machineForm.id
                ? {
                    ...machine,
                    name,
                    code: machineForm.code.trim() || undefined,
                    model: machineForm.model.trim() || undefined,
                    location: machineForm.location.trim() || undefined,
                    updatedAt: timestamp,
                  }
                : machine,
            ),
            updatedAt: timestamp,
          };
        }

        const machine: Machine = {
          id: newMachineId,
          name,
          code: machineForm.code.trim() || undefined,
          model: machineForm.model.trim() || undefined,
          location: machineForm.location.trim() || undefined,
          consumables: [],
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        return {
          ...line,
          machines: [...line.machines, machine],
          updatedAt: timestamp,
        };
      }),
      updatedAt: timestamp,
    }), machineForm.id ? '機台已更新。' : '機台已建立。', () => {
      if (!machineForm.id && !latestDrafts.current.consumable) {
        setSelectedMachineId(newMachineId);
        setConsumableForm(emptyConsumableForm);
      }
      setMachineForm(current => current === machineForm ? emptyMachineForm : current);
    });
  }

  function submitConsumable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedLine || !selectedMachine) {
      setError('請先建立或選擇機台。');
      return;
    }

    if (saving.current || composing.current) return;
    const lastDate = consumableForm.lastMaintainedDate;
    const planDate = consumableForm.plannedMaintenanceDate;
    if ((lastDate && !parseCalendarDate(lastDate)) || (planDate && !parseCalendarDate(planDate))) {
      setError('請輸入有效的西元日期，格式為 YYYY-MM-DD，例如 2026-09-08。');
      return;
    }
    if (lastDate > localDateString()) {
      setError('上次維護日期不可晚於今天。安排未來維護請填寫預定維護日期。');
      return;
    }
    const original = selectedMachine.consumables.find(item => item.id === consumableForm.id);
    const lastMaintainedAt = lastDate ? (original?.lastMaintainedAt && localDateString(new Date(original.lastMaintainedAt)) === lastDate
      ? original.lastMaintainedAt : parseCalendarDate(lastDate)!.toISOString()) : undefined;
    const name = consumableForm.name.trim();
    const maintenanceIntervalDays = Number(consumableForm.maintenanceIntervalDays);

    if (!name) {
      setError('耗材名稱為必填。');
      return;
    }

    if (!Number.isInteger(maintenanceIntervalDays) || maintenanceIntervalDays <= 0) {
      setError('維護週期必須是大於 0 的整數天數。');
      return;
    }

    updateData((current, timestamp) => ({
      ...current,
      productionLines: current.productionLines.map((line) => {
        if (line.id !== selectedLine.id) {
          return line;
        }

        return {
          ...line,
          machines: line.machines.map((machine) => {
            if (machine.id !== selectedMachine.id) {
              return machine;
            }

            if (consumableForm.id) {
              return {
                ...machine,
                consumables: machine.consumables.map((consumable) =>
                  consumable.id === consumableForm.id
                    ? {
                        ...consumable,
                        name,
                        sku: consumableForm.sku.trim() || undefined,
                        maintenanceIntervalDays,
                        lastMaintainedAt,
                        plannedMaintenanceDate: planDate || undefined,
                        notes: consumableForm.notes.trim() || undefined,
                        updatedAt: timestamp,
                      }
                    : consumable,
                ),
                updatedAt: timestamp,
              };
            }

            const consumable: Consumable = {
              id: newId(),
              name,
              sku: consumableForm.sku.trim() || undefined,
              maintenanceIntervalDays,
              lastMaintainedAt,
              plannedMaintenanceDate: planDate || undefined,
              notes: consumableForm.notes.trim() || undefined,
              createdAt: timestamp,
              updatedAt: timestamp,
            };
            return {
              ...machine,
              consumables: [...machine.consumables, consumable],
              updatedAt: timestamp,
            };
          }),
          updatedAt: timestamp,
        };
      }),
      updatedAt: timestamp,
    }), consumableForm.id ? '耗材已更新。' : '耗材已建立。', () => setConsumableForm(current => current === consumableForm ? emptyConsumableForm : current));
  }

  function deleteLine(lineId: string) {
    if (!window.confirm('刪除此產線會一併刪除底下機台與耗材，確定嗎？')) {
      return;
    }

    updateData((current, timestamp) => {
      const productionLines = current.productionLines.filter((line) => line.id !== lineId);
      return { ...current, productionLines, updatedAt: timestamp };
    }, '產線已刪除。', () => { if (lineForm.id === lineId) setLineForm(emptyLineForm); if (selectedLine?.id === lineId) { setMachineForm(emptyMachineForm); setConsumableForm(emptyConsumableForm); } });
  }

  function deleteMachine(machineId: string) {
    if (!selectedLine || !window.confirm('刪除此機台會一併刪除底下耗材，確定嗎？')) {
      return;
    }

    updateData((current, timestamp) => ({
      ...current,
      productionLines: current.productionLines.map((line) => {
        if (line.id !== selectedLine.id) {
          return line;
        }

        const machines = line.machines.filter((machine) => machine.id !== machineId);
        return { ...line, machines, updatedAt: timestamp };
      }),
      updatedAt: timestamp,
    }), '機台已刪除。', () => { if (machineForm.id === machineId) setMachineForm(emptyMachineForm); if (selectedMachine?.id === machineId) setConsumableForm(emptyConsumableForm); });
  }

  function deleteConsumable(consumableId: string) {
    if (!selectedLine || !selectedMachine || !window.confirm('確定刪除此耗材？')) {
      return;
    }

    updateData((current, timestamp) => ({
      ...current,
      productionLines: current.productionLines.map((line) =>
        line.id === selectedLine.id
          ? {
              ...line,
              machines: line.machines.map((machine) =>
                machine.id === selectedMachine.id
                  ? {
                      ...machine,
                      consumables: machine.consumables.filter((consumable) => consumable.id !== consumableId),
                      updatedAt: timestamp,
                    }
                  : machine,
              ),
              updatedAt: timestamp,
            }
          : line,
      ),
      updatedAt: timestamp,
    }), '耗材已刪除。', () => { if (consumableForm.id === consumableId) setConsumableForm(current => current === consumableForm ? emptyConsumableForm : current); });
  }

  function completeMaintenance(consumableId: string) {
    if (consumableForm.id === consumableId && consumableHasDraft && !window.confirm('此耗材有尚未儲存的內容。捨棄變更並記錄今日維護？')) return;
    if (!selectedLine || !selectedMachine) {
      return;
    }

    updateData((current, timestamp) => ({
      ...current,
      productionLines: current.productionLines.map((line) =>
        line.id === selectedLine.id
          ? {
              ...line,
              machines: line.machines.map((machine) =>
                machine.id === selectedMachine.id
                  ? {
                      ...machine,
                      consumables: machine.consumables.map((consumable) =>
                        consumable.id === consumableId ? markConsumableMaintained(consumable, new Date(timestamp)) : consumable,
                      ),
                      updatedAt: timestamp,
                    }
                  : machine,
              ),
              updatedAt: timestamp,
            }
          : line,
      ),
      updatedAt: timestamp,
    }), '已記錄今日維護，下次日期已依週期更新。', () => { if (consumableForm.id === consumableId) setConsumableForm(current => current === consumableForm ? emptyConsumableForm : current); });
  }

  if (!hasSession) {
    return (
      <main className="startScreen">
        <section className="startPanel">
          <div>
            <h1>工廠管理軟體</h1>
            <p>建立存檔或開啟現有資料。</p>
          </div>

          {(error || message) && (
            <section className={error ? 'notice errorNotice' : 'notice successNotice'} role={error ? 'alert' : 'status'}>
              {error || message}
            </section>
          )}

          <div className="startActions">
            <button
              className="startAction primaryStart"
              disabled={isBusy}
              type="button"
              onClick={() => void runSessionAction(() => window.factoryData.createNew(), '已建立新存檔。')}
            >
              <FileJson size={26} />
              <span>開新存檔</span>
              <small>選擇儲存位置，開始管理產線。</small>
            </button>

            <button
              className="startAction"
              disabled={isBusy}
              type="button"
              onClick={() => void runSessionAction(() => window.factoryData.open(), '已開啟存檔。')}
            >
              <FolderOpen size={26} />
              <span>開啟存檔</span>
              <small>選擇工廠管理存檔，繼續作業。</small>
            </button>

            <button
              className="startAction"
              disabled={isBusy}
              type="button"
              onClick={() => void runSessionAction(() => window.factoryData.loadDefault(), '已開啟預設存檔。')}
            >
              <Save size={26} />
              <span>讀取預設存檔</span>
              <small>開啟軟體資料夾中的預設資料。</small>
            </button>
          </div>

          <p className="startHint">{isBusy ? '正在開啟存檔…' : '存檔可備份或移至其他電腦使用。'}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="appShell">
      <header className="appHeader">
        <div>
          <h1>工廠管理軟體</h1>
          <p>管理產線、機台、耗材與維護提醒。</p>
        </div>
        <div className="summaryStrip" aria-label="資料摘要">
          <span>產線 {data.productionLines.length}</span>
          <span>機台 {data.productionLines.reduce((count, line) => count + line.machines.length, 0)}</span>
          <span>耗材 {allConsumables.length}</span>
          <span className={dueCount > 0 ? 'dangerText' : ''}>到期 {dueCount}</span>
          <span className={soonCount > 0 ? 'warningText' : ''}>7 日內到期 {soonCount}</span>
        </div>
      </header>

      <section className="systemBar" aria-live="polite">
        <div>
          <strong>目前存檔</strong>
          <span title={dataPath}>{dataPath}</span>
        </div>
        <div className="systemActions">
          <button
            className="secondaryButton compact"
            disabled={isBusy}
            type="button"
            onClick={() => void runSessionAction(() => window.factoryData.open(), '已切換存檔。')}
          >
            <FolderOpen size={16} />
            開啟其他存檔
          </button>
          <div className="saveState">{isBusy ? '正在儲存…' : hasDraft ? '有尚未儲存的內容' : error ? '請查看錯誤訊息' : '已儲存'}</div>
        </div>
      </section>

      {(error || message) && (
        <section className={error ? 'notice errorNotice' : 'notice successNotice'} role={error ? 'alert' : 'status'}>
          <span>{error || message}</span>
          <button type="button" className="noticeClose" aria-label="關閉提示" onClick={() => { setError(''); setMessage(''); }}>×</button>
        </section>
      )}

      <section className="workspaceGrid" aria-busy={isBusy}
        onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={() => { composing.current = false; }}
        onKeyDownCapture={event => { if (event.key === 'Enter' && (composing.current || event.nativeEvent.isComposing)) event.preventDefault(); }}
        onClickCapture={event => { if (saving.current && (event.target as HTMLElement).closest('button')) { event.preventDefault(); event.stopPropagation(); } }}>

        <section className="panel" aria-labelledby="lines-heading">
          <div className="panelHeader">
            <h2 id="lines-heading">產線</h2>
            <span>{data.productionLines.length} 筆</span>
            {pasteButton('line', '產線')}
          </div>

          <div className="itemList">
            {data.productionLines.length === 0 ? (
              <p className="emptyState">尚未建立產線。</p>
            ) : (
              data.productionLines.map((line, index) => (
                <article className={`listItem ${selectedLine?.id === line.id ? 'selected' : ''}`} key={line.id}>
                  <button
                    className="itemMain"
                    type="button"
                    aria-pressed={selectedLine?.id === line.id}
                    onClick={() => selectLine(line)}
                  >
                    <strong>{line.name}</strong>
                    <span>{line.description || '未填寫描述'}</span>
                  </button>
                  <div className="itemActions">
                    <button
                      title="編輯產線" aria-label={`編輯 ${line.name}`}
                      className="iconButton"
                      type="button"
                      onClick={() => { if (lineHasDraft && !window.confirm('捨棄尚未儲存的產線內容並編輯此產線？')) return; setLineForm(lineFields(line)); focusForm('line-form'); }}
                    >
                      <Edit3 size={16} />
                    </button>
                    <button
                      title="刪除產線" aria-label={`刪除 ${line.name}`}
                      className="iconButton danger"
                      type="button"
                      onClick={() => deleteLine(line.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  {itemTools('line', line, index, data.productionLines.length)}
                </article>
              ))
            )}
          </div>

          <form noValidate autoComplete="off" className="entityForm" id="line-form" onSubmit={submitLine}>
            <h3>{lineForm.id ? '編輯產線' : '新增產線'}</h3>
            <label>
              產線名稱
              <input required value={lineForm.name} onChange={(event) => setLineForm({ ...lineForm, name: event.target.value })} />
            </label>
            <label>
              描述
              <textarea aria-label="描述"
                value={lineForm.description}
                onChange={(event) => setLineForm({ ...lineForm, description: event.target.value })}
              />
            </label>
            <div className="formActions">
              <button className="primaryButton" disabled={isBusy} type="submit" onMouseDown={event => event.preventDefault()}>
                {lineForm.id ? <Save size={16} /> : <Plus size={16} />}
                {lineForm.id ? '儲存產線' : '建立產線'}
              </button>
              {lineForm.id && (
                <button className="secondaryButton" type="button" onClick={() => setLineForm(emptyLineForm)}>
                  取消
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="panel" aria-labelledby="machines-heading">
          <div className="panelHeader">
            <h2 id="machines-heading">機台</h2>
            <span>{selectedLine?.machines.length ?? 0} 筆</span>
            {pasteButton('machine', '機台')}
          </div>

          <p className="panelContext">{selectedLine?.name || '尚未選擇產線'}</p>
          <div className="itemList">
            {!selectedLine ? (
              <p className="emptyState">請先選擇產線。</p>
            ) : selectedLine.machines.length === 0 ? (
              <p className="emptyState">此產線尚未建立機台。</p>
            ) : (
              selectedLine.machines.map((machine, index) => (
                <article className={`listItem ${selectedMachine?.id === machine.id ? 'selected' : ''}`} key={machine.id}>
                  <button className="itemMain" type="button" aria-pressed={selectedMachine?.id === machine.id} onClick={() => selectMachine(machine)}>
                    <strong>{machine.name}</strong>
                    <span>{[machine.code, machine.model, machine.location].filter(Boolean).join(' / ') || '未填寫機台資料'}</span>
                  </button>
                  <div className="itemActions">
                    <button
                      title="編輯機台" aria-label={`編輯 ${machine.name}`}
                      className="iconButton"
                      type="button"
                      onClick={() => { if (machineHasDraft && !window.confirm('捨棄尚未儲存的機台內容並編輯此機台？')) return; setMachineForm(machineFields(machine)); focusForm('machine-form'); }}
                    >
                      <Edit3 size={16} />
                    </button>
                    <button
                      title="刪除機台" aria-label={`刪除 ${machine.name}`}
                      className="iconButton danger"
                      type="button"
                      onClick={() => deleteMachine(machine.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  {itemTools('machine', machine, index, selectedLine.machines.length)}
                </article>
              ))
            )}
          </div>

          <form noValidate autoComplete="off" className="entityForm" id="machine-form" onSubmit={submitMachine}>
            <h3>{machineForm.id ? '編輯機台' : '新增機台'}</h3>
            <label>
              機台名稱
              <input
                disabled={!selectedLine}
                required value={machineForm.name}
                onChange={(event) => setMachineForm({ ...machineForm, name: event.target.value })}
              />
            </label>
            <div className="formRow">
              <label>
                代碼
                <input
                  disabled={!selectedLine}
                  value={machineForm.code}
                  onChange={(event) => setMachineForm({ ...machineForm, code: event.target.value })}
                />
              </label>
              <label>
                型號
                <input
                  disabled={!selectedLine}
                  value={machineForm.model}
                  onChange={(event) => setMachineForm({ ...machineForm, model: event.target.value })}
                />
              </label>
            </div>
            <label>
              位置
              <input
                disabled={!selectedLine}
                value={machineForm.location}
                onChange={(event) => setMachineForm({ ...machineForm, location: event.target.value })}
              />
            </label>
            <div className="formActions">
              <button className="primaryButton" disabled={!selectedLine || isBusy} type="submit" onMouseDown={event => event.preventDefault()}>
                {machineForm.id ? <Save size={16} /> : <Plus size={16} />}
                {machineForm.id ? '儲存機台' : '建立機台'}
              </button>
              {machineForm.id && (
                <button className="secondaryButton" type="button" onClick={() => setMachineForm(emptyMachineForm)}>
                  取消
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="panel widePanel" aria-labelledby="consumables-heading">
          <div className="panelHeader">
            <h2 id="consumables-heading">耗材與維護</h2>
            <span>{selectedMachine?.consumables.length ?? 0} 筆</span>
            {pasteButton('consumable', '耗材')}
          </div>

          <p className="panelContext">{selectedMachine ? `${selectedLine?.name} ／ ${selectedMachine.name}` : '尚未選擇機台'}</p>
          <div className="itemList consumableList">
            {!selectedMachine ? (
              <p className="emptyState">請先選擇機台。</p>
            ) : selectedMachine.consumables.length === 0 ? (
              <p className="emptyState">此機台尚未建立耗材。</p>
            ) : (
              selectedMachine.consumables.map((consumable, index) => {
                const maintenance = getMaintenanceInfo(consumable, parseCalendarDate(today)!);
                return (
                  <article className="consumableItem" key={consumable.id}>
                    <div className="consumableTitle">
                      <div>
                        <strong>{consumable.name}</strong>
                        <span>{consumable.sku || '未填寫料號'}</span>
                      </div>
                      <span className={`statusPill ${statusTone(maintenance.status)}`}>
                        {statusLabel(maintenance.status, maintenance.daysRemaining)}
                      </span>
                    </div>
                    <dl className="maintenanceMeta">
                      <div>
                        <dt>週期</dt>
                        <dd>每 {consumable.maintenanceIntervalDays} 日</dd>
                      </div>
                      <div>
                        <dt>上次維護</dt>
                        <dd>{formatDate(consumable.lastMaintainedAt)}</dd>
                      </div>
                      <div>
                        <dt>{consumable.plannedMaintenanceDate ? '預定維護' : '下次維護'}</dt>
                        <dd>{formatDate(maintenance.nextMaintenanceDate)}</dd>
                      </div>
                    </dl>
                    {consumable.notes && <p className="notes">{consumable.notes}</p>}
                    <div className="itemActions alignLeft">
                      <button className="successButton" disabled={isBusy} type="button" onClick={() => completeMaintenance(consumable.id)}>
                        <CheckCircle2 size={16} />
                        完成今日維護
                      </button>
                      <button
                        className="secondaryButton compact"
                        type="button"
                        onClick={() => { if (consumableHasDraft && !window.confirm('捨棄尚未儲存的耗材內容並編輯此耗材？')) return; setConsumableForm(consumableFields(consumable)); focusForm('consumable-form'); }}
                      >
                        <Edit3 size={16} />
                        編輯
                      </button>
                      <button className="dangerButton compact" type="button" onClick={() => deleteConsumable(consumable.id)}>
                        <Trash2 size={16} />
                        刪除
                      </button>
                    </div>
                    {itemTools('consumable', consumable, index, selectedMachine.consumables.length)}
                  </article>
                );
              })
            )}
          </div>

          <form noValidate autoComplete="off" className="entityForm" id="consumable-form" onSubmit={submitConsumable}>
            <h3>{consumableForm.id ? '編輯耗材' : '新增耗材'}</h3>
            <div className="formRow">
              <label>
                耗材名稱
                <input
                  disabled={!selectedMachine}
                  required value={consumableForm.name}
                  onChange={(event) => setConsumableForm({ ...consumableForm, name: event.target.value })}
                />
              </label>
              <label>
                料號
                <input
                  disabled={!selectedMachine}
                  value={consumableForm.sku}
                  onChange={(event) => setConsumableForm({ ...consumableForm, sku: event.target.value })}
                />
              </label>
            </div>
            <label>
              維護週期（日）
              <input
                disabled={!selectedMachine}
                min="1" step="1" required
                type="number"
                value={consumableForm.maintenanceIntervalDays}
                onChange={(event) =>
                  setConsumableForm({ ...consumableForm, maintenanceIntervalDays: event.target.value })
                }
              />
            </label>
            <div className="formRow">
              <label>上次維護日期
                <input disabled={!selectedMachine} type="text" placeholder="YYYY-MM-DD" aria-describedby="date-help"
                  value={consumableForm.lastMaintainedDate} onChange={event => setConsumableForm({ ...consumableForm, lastMaintainedDate: event.target.value })} />
              </label>
              <label>預定維護日期
                <input disabled={!selectedMachine} type="text" placeholder="YYYY-MM-DD" aria-describedby="date-help"
                  value={consumableForm.plannedMaintenanceDate} onChange={event => setConsumableForm({ ...consumableForm, plannedMaintenanceDate: event.target.value })} />
              </label>
            </div>
            <p className="fieldHint" id="date-help">西元年月日，例如 2026-09-08。預定日期留空時，依維護週期計算。</p>
            <label>
              備註
              <textarea aria-label="備註"
                disabled={!selectedMachine}
                value={consumableForm.notes}
                onChange={(event) => setConsumableForm({ ...consumableForm, notes: event.target.value })}
              />
            </label>
            <div className="formActions">
              <button className="primaryButton" disabled={!selectedMachine || isBusy} type="submit" onMouseDown={event => event.preventDefault()}>
                {consumableForm.id ? <Save size={16} /> : <Wrench size={16} />}
                {consumableForm.id ? '儲存耗材' : '建立耗材'}
              </button>
              {consumableForm.id && (
                <button className="secondaryButton" type="button" onClick={() => setConsumableForm(emptyConsumableForm)}>
                  取消
                </button>
              )}
            </div>
          </form>
        </section>
      </section>
    </main>
  );
}
