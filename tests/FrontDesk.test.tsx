import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { addDays, localDateString } from '../shared/maintenance';
import type { Consumable, FactoryData } from '../shared/schema';

const now = new Date('2026-09-20T12:00:00');
const date = (days: number) => localDateString(addDays(now, days));
function fixture(): FactoryData {
  const item = (id: string, days: number): Consumable => ({
    id, name: id, sku: `SKU-${id}`, maintenanceIntervalDays: 30,
    createdAt: now.toISOString(), updatedAt: now.toISOString(),
    lastMaintainedAt: addDays(now, -40).toISOString(), plannedMaintenanceDate: date(days),
  });
  return { schemaVersion: 1, updatedAt: now.toISOString(), productionLines: [
    { id: 'a', name: '加工線', createdAt: now.toISOString(), updatedAt: now.toISOString(), machines: [
      { id: 'a1', name: '研磨機', code: 'GR-01', createdAt: now.toISOString(), updatedAt: now.toISOString(),
        consumables: [item('濾芯', -2), item('皮帶', 0)] },
    ] },
    { id: 'b', name: '包裝線', createdAt: now.toISOString(), updatedAt: now.toISOString(), machines: [
      { id: 'b1', name: '封口機', code: 'PK-02', createdAt: now.toISOString(), updatedAt: now.toISOString(),
        consumables: [item('加熱片', 12)] },
    ] },
  ] };
}

describe('front desk maintenance', () => {
  let data: FactoryData;
  const save = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    data = fixture();
    save.mockReset().mockImplementation(async (next: FactoryData) => {
      data = structuredClone(next);
      return { data, path: 'factory.json' };
    });
    vi.stubGlobal('confirm', vi.fn(() => true));
    Object.defineProperty(window, 'factoryData', { configurable: true, value: {
      createNew: vi.fn(async () => ({ data: { ...data, productionLines: [] }, path: 'new.json' })),
      open: vi.fn(async () => ({ data, path: 'factory.json' })),
      loadDefault: vi.fn(async () => ({ data, path: 'factory.json' })),
      save, getDataPath: vi.fn(async () => 'factory.json'),
    } });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  async function open() {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /讀取預設存檔/ }));
    return user;
  }
  const check = (name: string) => screen.getByRole('checkbox', { name: new RegExp(`完成.*${name}`) });
  const undo = (name: string) => screen.getByRole('button', { name: new RegExp(`復原.*${name}`) });

  it('opens in the front desk, separates overdue from today, and labels every location', async () => {
    await open();
    expect(screen.getByRole('heading', { name: '維護工作台' })).toBeInTheDocument();
    expect(screen.queryByLabelText('產線名稱')).not.toBeInTheDocument();
    const overdue = screen.getByRole('region', { name: /已逾期/ });
    const today = screen.getByRole('region', { name: /今天需要維護/ });
    expect(within(overdue).getByText('濾芯')).toBeInTheDocument();
    expect(within(overdue).queryByText('皮帶')).not.toBeInTheDocument();
    expect(within(today).getByText('皮帶')).toBeInTheDocument();
    expect(within(today).queryByText('濾芯')).not.toBeInTheDocument();
    expect(within(overdue).getByText('產線：加工線 → 機台：研磨機')).toBeInTheDocument();
    expect(screen.queryByText('加熱片')).not.toBeInTheDocument();
  });

  it('searches all lines, machines, names and SKUs, and completes future items in the right machine', async () => {
    const user = await open();
    const search = screen.getByRole('searchbox');
    for (const query of ['包裝線', '封口機', 'pk-02', '加熱片', 'sku-加熱片']) {
      await user.clear(search);
      await user.type(search, query);
      expect(screen.getByText('加熱片')).toBeInTheDocument();
      expect(screen.getByText('產線：包裝線 → 機台：封口機')).toBeInTheDocument();
    }
    await user.click(check('加熱片'));
    await waitFor(() => expect(check('加熱片')).toBeChecked());
    expect(check('加熱片')).toBeDisabled();
    expect(data.productionLines[1].machines[0].consumables[0].lastMaintainedAt).toBe(now.toISOString());
    expect(data.productionLines[1].machines[0].consumables[0].plannedMaintenanceDate).toBeUndefined();
    expect(data.productionLines[0]).toEqual(fixture().productionLines[0]);
  });

  it('persists completion, removes pending rows, and independently restores dates after several completions', async () => {
    const user = await open();
    await user.click(check('濾芯'));
    expect(screen.queryByRole('checkbox', { name: /濾芯/ })).not.toBeInTheDocument();
    await user.click(check('皮帶'));
    await user.click(undo('濾芯'));
    expect(check('濾芯')).not.toBeChecked();
    expect(data.productionLines[0].machines[0].consumables[0].plannedMaintenanceDate).toBe(date(-2));
    expect(data.productionLines[0].machines[0].consumables[0].lastMaintainedAt).toBe(addDays(now, -40).toISOString());
    expect(data.productionLines[0].machines[0].consumables[1].lastMaintainedAt).toBe(now.toISOString());
    expect(undo('皮帶')).toBeInTheDocument();
  });

  it('keeps an item pending on save failure and allows retry; failed undo stays retryable', async () => {
    const user = await open();
    save.mockRejectedValueOnce(new Error('disk full'));
    await user.click(check('濾芯'));
    expect(await screen.findByRole('alert')).toHaveTextContent('儲存失敗');
    expect(check('濾芯')).not.toBeChecked();
    expect(screen.queryByRole('button', { name: /復原.*濾芯/ })).not.toBeInTheDocument();
    await user.click(check('濾芯'));
    save.mockRejectedValueOnce(new Error('disk full'));
    await user.click(undo('濾芯'));
    expect(await screen.findByRole('alert')).toHaveTextContent('儲存失敗');
    expect(undo('濾芯')).toBeEnabled();
    await user.click(undo('濾芯'));
    expect(check('濾芯')).not.toBeChecked();
  });

  it('blocks overlapping saves and expires the undo action after 15 seconds', async () => {
    await open();
    let finish!: (value: { data: FactoryData; path: string }) => void;
    save.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    fireEvent.click(check('濾芯'));
    expect(check('皮帶')).toBeDisabled();
    expect(screen.getByRole('button', { name: '後台管理' })).toBeDisabled();
    fireEvent.click(check('皮帶'));
    expect(save).toHaveBeenCalledTimes(1);
    vi.useFakeTimers();
    await act(async () => finish({ data: save.mock.lastCall![0], path: 'factory.json' }));
    expect(undo('濾芯')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(15_001); });
    expect(screen.queryByRole('button', { name: /復原.*濾芯/ })).not.toBeInTheDocument();
  });

  it('keeps the full admin workspace behind a switch and protects unsaved drafts', async () => {
    const user = await open();
    await user.click(screen.getByRole('button', { name: '後台管理' }));
    await user.type(screen.getByLabelText('產線名稱'), '未存草稿');
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await user.click(screen.getByRole('button', { name: '返回前台' }));
    expect(screen.getByLabelText('產線名稱')).toHaveValue('未存草稿');
    await user.click(screen.getByRole('button', { name: '返回前台' }));
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
  });

  it('resets to the front desk on file switch and clears undo from the previous file', async () => {
    const user = await open();
    await user.click(check('濾芯'));
    await user.click(screen.getByRole('button', { name: '開啟其他存檔' }));
    expect(screen.queryByRole('button', { name: /復原.*濾芯/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '後台管理' }));
    await user.click(screen.getByRole('button', { name: '開啟其他存檔' }));
    expect(screen.getByRole('heading', { name: '維護工作台' })).toBeInTheDocument();
  });

  it('opens a new empty file in the front desk and explains how to add equipment', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /開新存檔/ }));
    expect(screen.getByRole('heading', { name: '維護工作台' })).toBeInTheDocument();
    expect(screen.getByText(/尚無耗材.*後台管理/)).toBeInTheDocument();
    expect(screen.queryByLabelText('產線名稱')).not.toBeInTheDocument();
  });

  it('distinguishes identically named consumables by their full location and supports empty search results', async () => {
    data.productionLines[1].machines[0].consumables[0].name = '濾芯';
    const user = await open();
    await user.type(screen.getByRole('searchbox'), ' 濾芯 ');
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    await user.click(screen.getByRole('checkbox', { name: '完成 包裝線 / 封口機 / 濾芯' }));
    expect(screen.getByRole('checkbox', { name: '完成 加工線 / 研磨機 / 濾芯' })).not.toBeChecked();
    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), '不存在的條目');
    expect(screen.getByText('找不到符合的條目，請換個關鍵字。')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '清除搜尋' }));
    expect(screen.getByRole('region', { name: /今天需要維護/ })).toBeInTheDocument();
  });

  it('refreshes the date across local midnight while the application stays open', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-20T23:59:45'));
    render(<App />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /讀取預設存檔/ })); });
    expect(within(screen.getByRole('region', { name: /今天需要維護/ })).getByText('皮帶')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(within(screen.getByRole('region', { name: /已逾期/ })).getByText('皮帶')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: /今天需要維護/ })).queryByText('皮帶')).not.toBeInTheDocument();
  });
});
