import { ItemTools } from './ItemTools';
import { FrontDesk } from './FrontDesk';
import { UpdateControl } from './UpdateControl';
import { SelectableCard } from './SelectableCard';
import { DateField } from './DateField';
import { copyItem, moveItem, dropCard, type CardLocation, type DropPosition } from '../shared/items';
import { CheckCircle2, FileJson, FolderOpen, Plus, Save, Wrench } from 'lucide-react';
import { FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { dueLabel, dueTone, getMaintenanceInfo, localDateString, parseCalendarDate, markConsumableMaintained } from '../shared/maintenance';
import type { Consumable, FactoryData, Machine, ProductionLine } from '../shared/schema';
import { createEmptyFactoryData, fileChangedCode } from '../shared/schema';

type FactoryDataSession = {
  data: FactoryData;
  path: string;
};

type MaintenanceUndo = {
  lineId: string;
  machineId: string;
  item: Consumable;
  label: string;
  completedAt: string;
  expiresAt: number;
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

function findSelectedLine(data: FactoryData, selectedLineId?: string): ProductionLine | undefined {
  return data.productionLines.find((line) => line.id === selectedLineId) ?? data.productionLines[0];
}

function findSelectedMachine(line?: ProductionLine, selectedMachineId?: string): Machine | undefined {
  return line?.machines.find((machine) => machine.id === selectedMachineId) ?? line?.machines[0];
}

export function App() {
  const [installingUpdate, setInstallingUpdate] = useState(false);
  const [data, setData] = useState<FactoryData>(() => createEmptyFactoryData());
  const [dataPath, setDataPath] = useState('');
  const [view, setView] = useState<'front' | 'admin'>('front');
  const [sessionVersion, setSessionVersion] = useState(0);
  const [undos, setUndos] = useState<MaintenanceUndo[]>([]);
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
  const [dragging, setDragging] = useState<CardLocation>();
  const [transferring, setTransferring] = useState(false);
  // "New" forms stay collapsed until asked for; editing, a draft, or an empty list also shows them.
  const [openForms, setOpenForms] = useState({ line: false, machine: false, consumable: false });
  const [clipboard, setClipboard] = useState<{ kind: 'line' | 'machine' | 'consumable'; item: ProductionLine | Machine | Consumable }>();
  const lineHasDraft = JSON.stringify(lineForm) !== JSON.stringify(lineFields(data.productionLines.find(line => line.id === lineForm.id)));
  const machines = data.productionLines.flatMap(line => line.machines);
  const machineHasDraft = JSON.stringify(machineForm) !== JSON.stringify(machineFields(machines.find(machine => machine.id === machineForm.id)));
  const consumableHasDraft = JSON.stringify(consumableForm) !== JSON.stringify(consumableFields(machines.flatMap(machine => machine.consumables).find(item => item.id === consumableForm.id)));
  const hasDraft = lineHasDraft || machineHasDraft || consumableHasDraft;
  const closeForm = (kind: 'line' | 'machine' | 'consumable') => setOpenForms(current => ({ ...current, [kind]: false }));
  // Save callbacks must consider drafts typed after the write began.
  const latestDrafts = useRef({ machine: machineHasDraft, consumable: consumableHasDraft });
  latestDrafts.current = { machine: machineHasDraft, consumable: consumableHasDraft };
  const [today, setToday] = useState(localDateString());
  useEffect(() => {
    if (!undos.length) return;
    const timer = window.setTimeout(() => setUndos(current => current.filter(entry => entry.expiresAt > Date.now())),
      Math.max(0, Math.min(...undos.map(entry => entry.expiresAt)) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [undos]);
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
    setView('front');
    setUndos([]);
    setSessionVersion(current => current + 1);
    setToday(localDateString());
    setDragging(undefined);
    setData(session.data);
    setDataPath(session.path);
    setClipboard(undefined);
    setOpenForms({ line: false, machine: false, consumable: false });
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
      setError(String(saveError).includes(fileChangedCode)
        ? '存檔已被其他程式或電腦修改。為避免覆蓋對方的資料，這次變更沒有儲存。請按「開啟其他存檔」重新開啟此檔後再操作。'
        : '儲存失敗，變更尚未套用，輸入內容已保留。請確認存檔位置可寫入後重試。');
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

  function handleDrop(source: CardLocation, target: CardLocation, position: DropPosition) {
    if (saving.current || composing.current) return;
    const next = dropCard(data, source, target, position, nowIso());
    if (next === data) return;
    const destinationLineId = target.kind === 'line' ? target.id : target.lineId;
    const changingLine = source.kind === 'machine' && source.lineId !== destinationLineId;
    // A cross-line move changes the forms' parent context. Preserve drafts on cancel/failure.
    if (changingLine && (machineHasDraft || consumableHasDraft) && !window.confirm('移動機台會切換產線並捨棄尚未儲存的機台與耗材內容。繼續移動？')) return;
    setTransferring(changingLine);
    void persist(next, source.kind === 'machine' && source.lineId !== destinationLineId ? '機台已移至目的產線。' : '排列順序已儲存。', () => {
      if (changingLine) {
        setSelectedLineId(destinationLineId);
        setSelectedMachineId(source.id);
        setMachineForm(emptyMachineForm);
        setConsumableForm(emptyConsumableForm);
      }
    }).finally(() => setTransferring(false));
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

  function itemTools(kind: 'line' | 'machine' | 'consumable', item: ProductionLine | Machine | Consumable, index: number, count: number,
    onEdit: () => void, onDelete: () => void, leading?: ReactNode) {
    return <ItemTools name={item.name} index={index} count={count} busy={isBusy} onEdit={onEdit} onDelete={onDelete}
      onMove={direction => move(kind, item.id, direction)}
      onCopy={() => { setClipboard({ kind, item: structuredClone(item) }); setError(''); setMessage(`已複製「${item.name}」。請選擇目的位置後貼上；副本不含維護日期。`); }}>
      {leading}
    </ItemTools>;
  }

  // Shown only while the clipboard holds this kind, so idle headers stay quiet.
  function pasteButton(kind: 'line' | 'machine' | 'consumable', label: string) {
    if (clipboard?.kind !== kind) return null;
    return <button className="secondaryButton compact pasteButton" type="button" disabled={isBusy || (kind === 'machine' && !selectedLine) || (kind === 'consumable' && !selectedMachine)}
      title={`貼上「${clipboard.item.name}」`}
      onClick={() => paste(kind)}>貼上{label}</button>;
  }

  function panelHeader(id: string, title: string, count: number, paste: ReactNode) {
    return <div className="panelHeader">
      <h2 id={id}>{title}</h2>
      <span className="countBadge">{count} 筆</span>
      {paste}
    </div>;
  }

  function addToggle(kind: 'line' | 'machine' | 'consumable', label: string) {
    return <div className="formToggle">
      <button className="secondaryButton" type="button" disabled={isBusy}
        onClick={() => { setOpenForms(current => ({ ...current, [kind]: true })); focusForm(`${kind}-form`); }}>
        <Plus size={16} />新增{label}
      </button>
    </div>;
  }

  function selectLine(line: ProductionLine) {
    if (saving.current) return false;
    if (line.id === selectedLine?.id) return true;
    if ((machineHasDraft || consumableHasDraft) && !window.confirm('切換產線會捨棄尚未儲存的機台與耗材內容。繼續切換？')) return false;
    setSelectedLineId(line.id);
    setSelectedMachineId(line.machines[0]?.id);
    setMachineForm(emptyMachineForm);
    setConsumableForm(emptyConsumableForm);
    return true;
  }

  function selectMachine(machine: Machine) {
    if (saving.current) return false;
    if (machine.id === selectedMachine?.id) return true;
    if (consumableHasDraft && !window.confirm('切換機台會捨棄尚未儲存的耗材內容。繼續切換？')) return false;
    setSelectedMachineId(machine.id);
    setConsumableForm(emptyConsumableForm);
    return true;
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
      if (!lineForm.id) setOpenForms(current => ({ ...current, line: true }));
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
      if (!machineForm.id) setOpenForms(current => ({ ...current, machine: true }));
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
    }), consumableForm.id ? '耗材已更新。' : '耗材已建立。', () => {
      if (!consumableForm.id) setOpenForms(current => ({ ...current, consumable: true }));
      setConsumableForm(current => current === consumableForm ? emptyConsumableForm : current);
    });
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

  function completeMaintenance(consumableId: string, lineId = selectedLine?.id, machineId = selectedMachine?.id) {
    if (saving.current) return;
    if (consumableForm.id === consumableId && consumableHasDraft && !window.confirm('此耗材有尚未儲存的內容。捨棄變更並記錄今日維護？')) return;
    const line = data.productionLines.find(entry => entry.id === lineId);
    const machine = line?.machines.find(entry => entry.id === machineId);
    const original = machine?.consumables.find(entry => entry.id === consumableId);
    if (!line || !machine || !original) return;
    const maintainedAt = new Date();

    updateData((current, timestamp) => ({
      ...current,
      productionLines: current.productionLines.map((line) =>
        line.id === lineId
          ? {
              ...line,
              machines: line.machines.map((machine) =>
                machine.id === machineId
                  ? {
                      ...machine,
                      consumables: machine.consumables.map((consumable) =>
                        consumable.id === consumableId ? markConsumableMaintained(consumable, maintainedAt) : consumable,
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
    }), '已記錄今日維護，下次日期已依週期更新。', () => {
      setToday(localDateString());
      if (view === 'front') setUndos(current => [...current, {
        lineId: line.id, machineId: machine.id, item: original,
        label: `${line.name} / ${machine.name} / ${original.name}`,
        completedAt: maintainedAt.toISOString(), expiresAt: Date.now() + 15_000,
      }]);
      if (consumableForm.id === consumableId) setConsumableForm(current => current === consumableForm ? emptyConsumableForm : current);
    });
  }

  function undoMaintenance(entry: MaintenanceUndo) {
    if (saving.current || entry.expiresAt <= Date.now()) return;
    updateData((current, timestamp) => ({ ...current, updatedAt: timestamp,
      productionLines: current.productionLines.map(line => line.id !== entry.lineId ? line : {
        ...line, updatedAt: timestamp, machines: line.machines.map(machine => machine.id !== entry.machineId ? machine : {
          ...machine, updatedAt: timestamp, consumables: machine.consumables.map(item =>
            item.id !== entry.item.id || item.lastMaintainedAt !== entry.completedAt ? item : {
              ...item, lastMaintainedAt: entry.item.lastMaintainedAt,
              plannedMaintenanceDate: entry.item.plannedMaintenanceDate, updatedAt: timestamp,
            }),
        }),
      }),
    }), `已復原「${entry.label}」的維護紀錄。`, () => setUndos(current => current.filter(item => item !== entry)));
  }

  function switchView() {
    if (saving.current) return;
    if (view === 'admin' && hasDraft) {
      if (!window.confirm('有尚未儲存的內容。捨棄變更並返回前台？')) return;
      setLineForm(emptyLineForm);
      setMachineForm(emptyMachineForm);
      setConsumableForm(emptyConsumableForm);
    }
    setDragging(undefined);
    setUndos([]);
    setMessage('');
    setOpenForms({ line: false, machine: false, consumable: false });
    setView(view === 'front' ? 'admin' : 'front');
  }

  if (!hasSession) {
    return (
      <main className="startScreen" inert={installingUpdate}>
        <section className="startPanel">
          <div>
            <h1>工廠管理軟體</h1>
            <p>選擇存檔，進入維護工作台。</p>
            <UpdateControl blocked={isBusy} onInstalling={setInstallingUpdate} />
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
              <small>建立空白存檔，再至後台設定設備。</small>
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
    <main className={`appShell ${view === 'front' ? 'frontShell' : 'adminShell'}`} inert={installingUpdate}>
      <header className="appHeader">
        <div>
          <h1>{view === 'front' ? '維護工作台' : '後台管理'}</h1>
          <p>{view === 'front' ? `${today.replaceAll('-', '/')} · 確認設備位置，勾選完成維護。` : '管理產線、機台、耗材與維護提醒。'}</p>
        </div>
        {view === 'admin' && <div className="summaryStrip adminSummary" aria-label="資料摘要">
          <span>產線 {data.productionLines.length}</span>
          <span>機台 {data.productionLines.reduce((count, line) => count + line.machines.length, 0)}</span>
          <span>耗材 {allConsumables.length}</span>
          <span className={dueCount > 0 ? 'dangerText' : ''}>到期 {dueCount}</span>
          <span className={soonCount > 0 ? 'warningText' : ''}>7 天內到期 {soonCount}</span>
        </div>}
        <button type="button" className="secondaryButton viewSwitch" disabled={isBusy} onClick={switchView}>
          {view === 'front' ? '後台管理' : '返回前台'}
        </button>
      </header>

      <section className="systemBar" aria-live="polite">
        <div className="systemFile">
          <strong>目前存檔</strong>
          <span title={dataPath}>{dataPath.split(/[\\/]/).pop()}</span>
        </div>
        <div className="systemActions">
          <UpdateControl blocked={hasDraft || isBusy} onInstalling={setInstallingUpdate} />
          <button
            className="secondaryButton compact"
            disabled={isBusy}
            type="button"
            onClick={() => void runSessionAction(() => window.factoryData.open(), '已切換存檔。')}
          >
            <FolderOpen size={16} />
            開啟其他存檔
          </button>
          <div className={`saveState ${isBusy ? '' : hasDraft ? 'isDraft' : error ? 'isError' : 'isSaved'}`}>
            {isBusy ? '正在儲存…' : hasDraft ? '有尚未儲存的內容' : error ? '請查看錯誤訊息' : <><CheckCircle2 size={15} aria-hidden="true" /><span>已儲存</span></>}
          </div>
        </div>
      </section>

      {(error || (message && undos.length === 0)) && (
        <section className={error ? 'notice errorNotice' : 'notice successNotice'} role={error ? 'alert' : 'status'}>
          <span>{error || message}</span>
          <button type="button" className="noticeClose" aria-label="關閉提示" onClick={() => { setError(''); setMessage(''); }}>×</button>
        </section>
      )}

      {view === 'front' ? <FrontDesk key={sessionVersion} data={data} today={today} busy={isBusy} onComplete={completeMaintenance} /> : <section className="workspaceGrid" aria-busy={isBusy}
        onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={() => { composing.current = false; }}
        onBlurCapture={() => { composing.current = false; }}
        onKeyDownCapture={event => { if (event.key === 'Enter' && (composing.current || event.nativeEvent.isComposing)) event.preventDefault(); }}
        onClickCapture={event => { if (saving.current && (event.target as HTMLElement).closest('button')) { event.preventDefault(); event.stopPropagation(); } }}>

        <section className="panel" aria-labelledby="lines-heading">
          {panelHeader('lines-heading', '產線', data.productionLines.length, pasteButton('line', '產線'))}

          <div className="itemList">
            {data.productionLines.length === 0 ? (
              <p className="emptyState">尚未建立產線。</p>
            ) : (
              data.productionLines.map((line, index) => (
                <SelectableCard key={line.id} location={{ kind: 'line', id: line.id }} selected={selectedLine?.id === line.id}
                  busy={isBusy} dragging={dragging} onDrag={setDragging} onDrop={handleDrop} onSelect={() => selectLine(line)}>
                  <button
                    className="itemMain"
                    type="button"
                    aria-pressed={selectedLine?.id === line.id}
                    onClick={() => selectLine(line)}
                  >
                    <strong>{line.name}</strong>
                    <span>{line.description || '未填寫描述'}</span>
                  </button>
                  {itemTools('line', line, index, data.productionLines.length,
                    () => { if (lineHasDraft && !window.confirm('捨棄尚未儲存的產線內容並編輯此產線？')) return; if (!selectLine(line)) return; setLineForm(lineFields(line)); focusForm('line-form'); },
                    () => deleteLine(line.id))}
                </SelectableCard>
              ))
            )}
          </div>

          <p className="fieldHint dragHint">拖動卡片可調整產線順序；也可使用上下移按鈕。</p>
          {!(openForms.line || lineForm.id || lineHasDraft || data.productionLines.length === 0) ? addToggle('line', '產線') : <form noValidate autoComplete="off" className="entityForm" id="line-form" onSubmit={submitLine}>
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
              {(lineForm.id || openForms.line) && (
                <button className="secondaryButton" type="button" onClick={() => { setLineForm(emptyLineForm); closeForm('line'); }}>
                  取消
                </button>
              )}
            </div>
          </form>}
        </section>

        <section className="panel" aria-labelledby="machines-heading">
          {panelHeader('machines-heading', '機台', selectedLine?.machines.length ?? 0, pasteButton('machine', '機台'))}

          <p className="panelContext">{selectedLine?.name || '尚未選擇產線'}</p>
          <div className="itemList">
            {!selectedLine ? (
              <p className="emptyState">請先選擇產線。</p>
            ) : selectedLine.machines.length === 0 ? (
              <p className="emptyState">此產線尚未建立機台。</p>
            ) : (
              selectedLine.machines.map((machine, index) => (
                <SelectableCard key={machine.id} location={{ kind: 'machine', id: machine.id, lineId: selectedLine.id }} selected={selectedMachine?.id === machine.id}
                  busy={isBusy} dragging={dragging} onDrag={setDragging} onDrop={handleDrop} onSelect={() => selectMachine(machine)}>
                  <button className="itemMain" type="button" aria-pressed={selectedMachine?.id === machine.id} onClick={() => selectMachine(machine)}>
                    <strong>{machine.name}</strong>
                    <span>{[machine.code, machine.model, machine.location].filter(Boolean).join(' / ') || '未填寫機台資料'}</span>
                  </button>
                  {itemTools('machine', machine, index, selectedLine.machines.length,
                    () => { if (machineHasDraft && !window.confirm('捨棄尚未儲存的機台內容並編輯此機台？')) return; if (!selectMachine(machine)) return; setMachineForm(machineFields(machine)); focusForm('machine-form'); },
                    () => deleteMachine(machine.id))}
                </SelectableCard>
              ))
            )}
          </div>

          <p className="fieldHint dragHint">拖動卡片可排序，拖到左側產線卡片可移轉機台。</p>
          {selectedLine && (!(openForms.machine || machineForm.id || machineHasDraft || selectedLine.machines.length === 0) ? addToggle('machine', '機台') : <form inert={transferring} noValidate autoComplete="off" className="entityForm" id="machine-form" onSubmit={submitMachine}>
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
              {(machineForm.id || openForms.machine) && (
                <button className="secondaryButton" type="button" onClick={() => { setMachineForm(emptyMachineForm); closeForm('machine'); }}>
                  取消
                </button>
              )}
            </div>
          </form>)}
        </section>

        <section className="panel widePanel" aria-labelledby="consumables-heading">
          {panelHeader('consumables-heading', '耗材與維護', selectedMachine?.consumables.length ?? 0, pasteButton('consumable', '耗材'))}

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
                      <span className={`statusPill ${dueTone(maintenance.daysRemaining)}`}>
                        {dueLabel(maintenance.daysRemaining)}
                      </span>
                    </div>
                    <dl className="maintenanceMeta">
                      <div>
                        <dt>週期</dt>
                        <dd>每 {consumable.maintenanceIntervalDays} 天</dd>
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
                    {itemTools('consumable', consumable, index, selectedMachine.consumables.length,
                      () => { if (consumableHasDraft && !window.confirm('捨棄尚未儲存的耗材內容並編輯此耗材？')) return; setConsumableForm(consumableFields(consumable)); focusForm('consumable-form'); },
                      () => deleteConsumable(consumable.id),
                      <button className="successButton" disabled={isBusy} type="button" onClick={() => completeMaintenance(consumable.id)}>
                        <CheckCircle2 size={16} />
                        完成今日維護
                      </button>)}
                  </article>
                );
              })
            )}
          </div>

          {selectedMachine && (!(openForms.consumable || consumableForm.id || consumableHasDraft || selectedMachine.consumables.length === 0) ? addToggle('consumable', '耗材') : <form inert={transferring} noValidate autoComplete="off" className="entityForm" id="consumable-form" onSubmit={submitConsumable}>
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
            <label>
              維護週期（天）
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
            </div>
            <div className="formRow">
              <DateField label="上次維護日期" disabled={!selectedMachine} describedBy="date-help" value={consumableForm.lastMaintainedDate}
                onChange={value => setConsumableForm(current => ({ ...current, lastMaintainedDate: value }))} />
              <DateField label="預定維護日期" disabled={!selectedMachine} describedBy="date-help" value={consumableForm.plannedMaintenanceDate}
                onChange={value => setConsumableForm(current => ({ ...current, plannedMaintenanceDate: value }))} />
            </div>
            <p className="fieldHint" id="date-help">西元日期 YYYY-MM-DD，或按月曆圖示選擇；預定留空時依週期計算。</p>
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
              {(consumableForm.id || openForms.consumable) && (
                <button className="secondaryButton" type="button" onClick={() => { setConsumableForm(emptyConsumableForm); closeForm('consumable'); }}>
                  取消
                </button>
              )}
            </div>
          </form>)}
        </section>
      </section>}
      {undos.length > 0 && <aside className="undoPanel" aria-label="復原維護" aria-live="polite">
        <p>已完成維護 · 每筆可在 15 秒內復原</p>
        {undos.map(entry => <div className="undoRow" key={JSON.stringify([entry.lineId, entry.machineId, entry.item.id, entry.completedAt])}>
          <span>{entry.label}</span>
          <button type="button" className="secondaryButton compact" disabled={isBusy}
            aria-label={`復原 ${entry.label}`} onClick={() => undoMaintenance(entry)}>復原</button>
        </div>)}
      </aside>}
    </main>
  );
}
