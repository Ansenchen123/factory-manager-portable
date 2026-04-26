import { CheckCircle2, Edit3, FileJson, FolderOpen, Plus, Save, Trash2, Wrench } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { getMaintenanceInfo, markConsumableMaintained, type MaintenanceStatus } from '../shared/maintenance';
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
};

const emptyLineForm: LineForm = { name: '', description: '' };
const emptyMachineForm: MachineForm = { name: '', code: '', model: '', location: '' };
const emptyConsumableForm: ConsumableForm = { name: '', sku: '', maintenanceIntervalDays: '30', notes: '' };

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

  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
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

  const hasSession = Boolean(dataPath);
  const selectedLine = useMemo(() => findSelectedLine(data, selectedLineId), [data, selectedLineId]);
  const selectedMachine = useMemo(
    () => findSelectedMachine(selectedLine, selectedMachineId),
    [selectedLine, selectedMachineId],
  );

  const allConsumables = data.productionLines.flatMap((line) =>
    line.machines.flatMap((machine) => machine.consumables),
  );
  const dueCount = allConsumables.filter((consumable) => getMaintenanceInfo(consumable).status === 'due').length;
  const soonCount = allConsumables.filter((consumable) => getMaintenanceInfo(consumable).status === 'soon').length;

  function applySession(session: FactoryDataSession, nextMessage: string) {
    setData(session.data);
    setDataPath(session.path);
    setSelectedLineId(session.data.productionLines[0]?.id);
    setSelectedMachineId(session.data.productionLines[0]?.machines[0]?.id);
    setLineForm(emptyLineForm);
    setMachineForm(emptyMachineForm);
    setConsumableForm(emptyConsumableForm);
    setMessage(nextMessage);
    setError('');
  }

  async function runSessionAction(action: () => Promise<FactoryDataSession | null>, nextMessage: string) {
    if (!window.factoryData) {
      setError('請透過桌面 App 啟動，瀏覽器預覽無法直接存取本機 JSON。');
      return;
    }

    setIsBusy(true);
    setError('');
    try {
      const session = await action();
      if (session) {
        applySession(session, nextMessage);
      }
    } catch (sessionError) {
      setError(sessionError instanceof Error ? sessionError.message : '存檔操作失敗');
    } finally {
      setIsBusy(false);
    }
  }

  async function persist(nextData: FactoryData, successMessage: string) {
    setIsBusy(true);
    setError('');

    try {
      const session = await window.factoryData.save(nextData);
      applySession(session, successMessage);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '資料儲存失敗');
    } finally {
      setIsBusy(false);
    }
  }

  function updateData(mutator: (current: FactoryData, timestamp: string) => FactoryData, successMessage: string) {
    const timestamp = nowIso();
    const nextData = mutator(data, timestamp);
    void persist(nextData, successMessage);
  }

  function submitLine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
        id: newId(),
        name,
        description: lineForm.description.trim() || undefined,
        machines: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      setSelectedLineId(line.id);
      setSelectedMachineId(undefined);
      return {
        ...current,
        productionLines: [...current.productionLines, line],
        updatedAt: timestamp,
      };
    }, lineForm.id ? '產線已更新。' : '產線已建立。');
    setLineForm(emptyLineForm);
  }

  function submitMachine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedLine) {
      setError('請先建立或選擇產線。');
      return;
    }

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
          id: newId(),
          name,
          code: machineForm.code.trim() || undefined,
          model: machineForm.model.trim() || undefined,
          location: machineForm.location.trim() || undefined,
          consumables: [],
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        setSelectedMachineId(machine.id);
        return {
          ...line,
          machines: [...line.machines, machine],
          updatedAt: timestamp,
        };
      }),
      updatedAt: timestamp,
    }), machineForm.id ? '機台已更新。' : '機台已建立。');
    setMachineForm(emptyMachineForm);
  }

  function submitConsumable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedLine || !selectedMachine) {
      setError('請先建立或選擇機台。');
      return;
    }

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
    }), consumableForm.id ? '耗材已更新。' : '耗材已建立。');
    setConsumableForm(emptyConsumableForm);
  }

  function deleteLine(lineId: string) {
    if (!window.confirm('刪除此產線會一併刪除底下機台與耗材，確定嗎？')) {
      return;
    }

    updateData((current, timestamp) => {
      const productionLines = current.productionLines.filter((line) => line.id !== lineId);
      setSelectedLineId(productionLines[0]?.id);
      setSelectedMachineId(productionLines[0]?.machines[0]?.id);
      return { ...current, productionLines, updatedAt: timestamp };
    }, '產線已刪除。');
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
        setSelectedMachineId(machines[0]?.id);
        return { ...line, machines, updatedAt: timestamp };
      }),
      updatedAt: timestamp,
    }), '機台已刪除。');
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
    }), '耗材已刪除。');
  }

  function completeMaintenance(consumableId: string) {
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
    }), '已標記維護完成，下一次提醒已重新計算。');
  }

  if (!hasSession) {
    return (
      <main className="startScreen">
        <section className="startPanel">
          <div>
            <h1>工廠管理軟體</h1>
            <p>請先建立新存檔，或開啟既有的 JSON 存檔。</p>
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
              <small>選擇位置並建立一個空白 JSON 存檔。</small>
            </button>

            <button
              className="startAction"
              disabled={isBusy}
              type="button"
              onClick={() => void runSessionAction(() => window.factoryData.open(), '已開啟存檔。')}
            >
              <FolderOpen size={26} />
              <span>開啟存檔</span>
              <small>讀取既有的 factory-data.json 或其他相容 JSON。</small>
            </button>

            <button
              className="startAction"
              disabled={isBusy}
              type="button"
              onClick={() => void runSessionAction(() => window.factoryData.loadDefault(), '已讀取預設可攜存檔。')}
            >
              <Save size={26} />
              <span>讀取預設存檔</span>
              <small>使用 App 資料夾內的 data/factory-data.json。</small>
            </button>
          </div>

          <p className="startHint">{isBusy ? '處理存檔中...' : '存檔會以 JSON 格式保存，可複製到其他平台版本使用。'}</p>
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
          <span className={soonCount > 0 ? 'warningText' : ''}>7日內 {soonCount}</span>
        </div>
      </header>

      <section className="systemBar" aria-live="polite">
        <div>
          <strong>目前存檔</strong>
          <span>{dataPath}</span>
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
          <div className="saveState">{isBusy ? '處理中...' : '已連接本機 JSON'}</div>
        </div>
      </section>

      {(error || message) && (
        <section className={error ? 'notice errorNotice' : 'notice successNotice'} role={error ? 'alert' : 'status'}>
          {error || message}
        </section>
      )}

      <section className="workspaceGrid">
        <section className="panel" aria-labelledby="lines-heading">
          <div className="panelHeader">
            <h2 id="lines-heading">產線</h2>
            <span>{data.productionLines.length} 筆</span>
          </div>

          <div className="itemList">
            {data.productionLines.length === 0 ? (
              <p className="emptyState">尚未建立產線。</p>
            ) : (
              data.productionLines.map((line) => (
                <article className={`listItem ${selectedLine?.id === line.id ? 'selected' : ''}`} key={line.id}>
                  <button
                    className="itemMain"
                    type="button"
                    onClick={() => {
                      setSelectedLineId(line.id);
                      setSelectedMachineId(line.machines[0]?.id);
                    }}
                  >
                    <strong>{line.name}</strong>
                    <span>{line.description || '無描述'}</span>
                  </button>
                  <div className="itemActions">
                    <button
                      aria-label={`編輯 ${line.name}`}
                      className="iconButton"
                      type="button"
                      onClick={() => setLineForm({ id: line.id, name: line.name, description: line.description ?? '' })}
                    >
                      <Edit3 size={16} />
                    </button>
                    <button
                      aria-label={`刪除 ${line.name}`}
                      className="iconButton danger"
                      type="button"
                      onClick={() => deleteLine(line.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>

          <form className="entityForm" onSubmit={submitLine}>
            <h3>{lineForm.id ? '編輯產線' : '新增產線'}</h3>
            <label>
              產線名稱
              <input value={lineForm.name} onChange={(event) => setLineForm({ ...lineForm, name: event.target.value })} />
            </label>
            <label>
              描述
              <textarea
                value={lineForm.description}
                onChange={(event) => setLineForm({ ...lineForm, description: event.target.value })}
              />
            </label>
            <div className="formActions">
              <button className="primaryButton" disabled={isBusy} type="submit">
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
          </div>

          <div className="itemList">
            {!selectedLine ? (
              <p className="emptyState">請先選擇產線。</p>
            ) : selectedLine.machines.length === 0 ? (
              <p className="emptyState">此產線尚未建立機台。</p>
            ) : (
              selectedLine.machines.map((machine) => (
                <article className={`listItem ${selectedMachine?.id === machine.id ? 'selected' : ''}`} key={machine.id}>
                  <button className="itemMain" type="button" onClick={() => setSelectedMachineId(machine.id)}>
                    <strong>{machine.name}</strong>
                    <span>{[machine.code, machine.model, machine.location].filter(Boolean).join(' / ') || '無代碼資料'}</span>
                  </button>
                  <div className="itemActions">
                    <button
                      aria-label={`編輯 ${machine.name}`}
                      className="iconButton"
                      type="button"
                      onClick={() =>
                        setMachineForm({
                          id: machine.id,
                          name: machine.name,
                          code: machine.code ?? '',
                          model: machine.model ?? '',
                          location: machine.location ?? '',
                        })
                      }
                    >
                      <Edit3 size={16} />
                    </button>
                    <button
                      aria-label={`刪除 ${machine.name}`}
                      className="iconButton danger"
                      type="button"
                      onClick={() => deleteMachine(machine.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>

          <form className="entityForm" onSubmit={submitMachine}>
            <h3>{machineForm.id ? '編輯機台' : '新增機台'}</h3>
            <label>
              機台名稱
              <input
                disabled={!selectedLine}
                value={machineForm.name}
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
              <button className="primaryButton" disabled={!selectedLine || isBusy} type="submit">
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
          </div>

          <div className="itemList consumableList">
            {!selectedMachine ? (
              <p className="emptyState">請先選擇機台。</p>
            ) : selectedMachine.consumables.length === 0 ? (
              <p className="emptyState">此機台尚未建立耗材。</p>
            ) : (
              selectedMachine.consumables.map((consumable) => {
                const maintenance = getMaintenanceInfo(consumable);
                return (
                  <article className="consumableItem" key={consumable.id}>
                    <div className="consumableTitle">
                      <div>
                        <strong>{consumable.name}</strong>
                        <span>{consumable.sku || '無料號'}</span>
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
                        <dt>下次維護</dt>
                        <dd>{formatDate(maintenance.nextMaintenanceDate)}</dd>
                      </div>
                    </dl>
                    {consumable.notes && <p className="notes">{consumable.notes}</p>}
                    <div className="itemActions alignLeft">
                      <button className="successButton" disabled={isBusy} type="button" onClick={() => completeMaintenance(consumable.id)}>
                        <CheckCircle2 size={16} />
                        標記已維護
                      </button>
                      <button
                        className="secondaryButton compact"
                        type="button"
                        onClick={() =>
                          setConsumableForm({
                            id: consumable.id,
                            name: consumable.name,
                            sku: consumable.sku ?? '',
                            maintenanceIntervalDays: String(consumable.maintenanceIntervalDays),
                            notes: consumable.notes ?? '',
                          })
                        }
                      >
                        <Edit3 size={16} />
                        編輯
                      </button>
                      <button className="dangerButton compact" type="button" onClick={() => deleteConsumable(consumable.id)}>
                        <Trash2 size={16} />
                        刪除
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>

          <form className="entityForm" onSubmit={submitConsumable}>
            <h3>{consumableForm.id ? '編輯耗材' : '新增耗材'}</h3>
            <div className="formRow">
              <label>
                耗材名稱
                <input
                  disabled={!selectedMachine}
                  value={consumableForm.name}
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
                min="1"
                type="number"
                value={consumableForm.maintenanceIntervalDays}
                onChange={(event) =>
                  setConsumableForm({ ...consumableForm, maintenanceIntervalDays: event.target.value })
                }
              />
            </label>
            <label>
              備註
              <textarea
                disabled={!selectedMachine}
                value={consumableForm.notes}
                onChange={(event) => setConsumableForm({ ...consumableForm, notes: event.target.value })}
              />
            </label>
            <div className="formActions">
              <button className="primaryButton" disabled={!selectedMachine || isBusy} type="submit">
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
