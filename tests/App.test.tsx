import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import type { FactoryData } from '../shared/schema';

const dataPath = 'C:\\Factory\\data\\factory-data.json';

const initialData: FactoryData = {
  schemaVersion: 1,
  updatedAt: '2026-04-26T00:00:00.000Z',
  productionLines: [
    {
      id: 'line-1',
      name: 'A線',
      description: '主要加工線',
      machines: [
        {
          id: 'machine-1',
          name: 'CNC-01',
          code: 'CNC01',
          consumables: [
            {
              id: 'consumable-1',
              name: '濾芯',
              sku: 'FILTER-01',
              maintenanceIntervalDays: 1,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
};

async function openDefaultSave(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /讀取預設存檔/ }));
  await screen.findByText('A線', { selector: 'strong' });
}

describe('App', () => {
  const saveMock = vi.fn(async (data: FactoryData) => ({ data, path: dataPath }));

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('confirm', vi.fn(() => true));
    Object.defineProperty(window, 'factoryData', {
      configurable: true,
      value: {
        createNew: vi.fn(async () => ({ data: { ...initialData, productionLines: [] }, path: dataPath })),
        open: vi.fn(async () => ({ data: initialData, path: dataPath })),
        loadDefault: vi.fn(async () => ({ data: initialData, path: dataPath })),
        save: saveMock,
        getDataPath: vi.fn(async () => dataPath),
      },
    });
  });

  it('starts on the save selection screen', () => {
    render(<App />);

    expect(screen.getByRole('button', { name: /開新存檔/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /開啟存檔/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /讀取預設存檔/ })).toBeInTheDocument();
  });

  it('loads a save file before rendering the hierarchy workspace', async () => {
    const user = userEvent.setup();
    render(<App />);

    await openDefaultSave(user);

    expect(screen.getByText('CNC-01')).toBeInTheDocument();
    expect(screen.getByText('濾芯')).toBeInTheDocument();
    expect(screen.getByText(/逾期|今日到期/)).toBeInTheDocument();
  });

  it('creates a line through the UI after a save file is open', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openDefaultSave(user);

    const lineForm = screen.getByRole('heading', { name: '新增產線' }).closest('form');
    expect(lineForm).not.toBeNull();
    await user.type(within(lineForm as HTMLElement).getByLabelText('產線名稱'), 'B線');
    await user.click(within(lineForm as HTMLElement).getByRole('button', { name: '建立產線' }));

    await waitFor(() => expect(saveMock).toHaveBeenCalled());
    expect(saveMock.mock.lastCall?.[0].productionLines.some((line: FactoryData['productionLines'][number]) => line.name === 'B線')).toBe(
      true,
    );
  });

  it('marks a consumable as maintained and persists lastMaintainedAt', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openDefaultSave(user);

    await user.click(screen.getByRole('button', { name: '完成今日維護' }));

    await waitFor(() => {
      const savedData = saveMock.mock.lastCall?.[0] as FactoryData | undefined;
      const savedConsumable =
        savedData?.productionLines[0]?.machines[0]?.consumables.find((consumable) => consumable.id === 'consumable-1');

      expect(savedConsumable?.lastMaintainedAt).toEqual(expect.any(String));
    });
  });

  it('keeps the selected line and unrelated draft after saving', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openDefaultSave(user);
    await user.type(screen.getByLabelText('產線名稱'), 'B線');
    await user.click(screen.getByRole('button', { name: '建立產線' }));
    await screen.findByText('B線', { selector: 'strong' });
    expect(screen.queryByText('CNC-01')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('產線名稱'), '待填草稿');
    await user.type(screen.getByLabelText('機台名稱'), 'B機台');
    await user.click(screen.getByRole('button', { name: '建立機台' }));
    await screen.findByText('B機台');
    expect(screen.getByLabelText('產線名稱')).toHaveValue('待填草稿');
  });

  it('retains entered data when saving fails', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openDefaultSave(user);
    saveMock.mockRejectedValueOnce(new Error('磁碟無法寫入'));
    await user.type(screen.getByLabelText('產線名稱'), '尚未儲存');
    await user.click(screen.getByRole('button', { name: '建立產線' }));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('產線名稱')).toHaveValue('尚未儲存');
  });
  it('copies a machine with new descendant IDs and pastes into another line', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openDefaultSave(user);
    await user.click(screen.getByRole('button', { name: '複製 CNC-01' }));
    await user.type(screen.getByLabelText('產線名稱'), 'B線');
    await user.click(screen.getByRole('button', { name: '建立產線' }));
    await user.click(screen.getByRole('button', { name: '貼上機台' }));
    await screen.findByText('CNC-01（副本）');
    const copy = saveMock.mock.lastCall![0].productionLines[1].machines[0];
    expect(copy.id).not.toBe('machine-1');
    expect(copy.consumables[0].id).not.toBe('consumable-1');
    expect(copy.consumables[0].lastMaintainedAt).toBeUndefined();
  });

  it('persists ordering while keeping the current selection', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openDefaultSave(user);
    await user.type(screen.getByLabelText('產線名稱'), 'B線');
    await user.click(screen.getByRole('button', { name: '建立產線' }));
    await user.click(screen.getByRole('button', { name: '上移 B線' }));
    expect(saveMock.mock.lastCall![0].productionLines.map(line => line.name)).toEqual(['B線', 'A線']);
    expect(screen.queryByText('CNC-01')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '上移 B線' })).toBeDisabled();
  });

  it('saves typed Gregorian dates and uses the planned date for the reminder', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openDefaultSave(user);
    await user.click(screen.getByRole('button', { name: '編輯' }));
    await user.type(screen.getByLabelText('上次維護日期'), '2026-01-02');
    await user.type(screen.getByLabelText('預定維護日期'), '2027-03-15');
    await user.click(screen.getByRole('button', { name: '儲存耗材' }));
    await screen.findByText('2027/03/15');
    const item = saveMock.mock.lastCall![0].productionLines[0].machines[0].consumables[0];
    expect(item.plannedMaintenanceDate).toBe('2027-03-15');
    expect(new Date(item.lastMaintainedAt!).getDate()).toBe(2);
  });

  it('rejects impossible dates without losing the draft', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openDefaultSave(user);
    await user.type(screen.getByLabelText('耗材名稱'), '皮帶');
    await user.type(screen.getByLabelText('預定維護日期'), '2027-02-29');
    await user.click(screen.getByRole('button', { name: '建立耗材' }));
    expect(saveMock).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('有效的西元日期');
    expect(screen.getByLabelText('耗材名稱')).toHaveValue('皮帶');
  });

  it('keeps text focus when saving with the mouse', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openDefaultSave(user);
    const input = screen.getByLabelText('產線名稱');
    await user.type(input, '中文產線');
    await user.click(screen.getByRole('button', { name: '建立產線' }));
    expect(input).toHaveFocus();
    expect(input).toHaveValue('');
  });

  it('does not submit Enter while the Chinese IME is composing', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openDefaultSave(user);
    const input = screen.getByLabelText('產線名稱');
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: '中文' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    fireEvent.submit(input.closest('form')!);
    expect(saveMock).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input);
    await user.click(screen.getByRole('button', { name: '建立產線' }));
    expect(saveMock).toHaveBeenCalledOnce();
  });

  it('preserves new typing during a slow save and blocks concurrent saves', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openDefaultSave(user);
    let finish!: (value: { data: FactoryData; path: string }) => void;
    saveMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const input = screen.getByLabelText('產線名稱');
    await user.type(input, '第一筆');
    await user.click(screen.getByRole('button', { name: '建立產線' }));
    expect(input).not.toBeDisabled();
    expect(input).not.toHaveAttribute('readonly');
    await user.clear(input);
    await user.type(input, '第二筆');
    fireEvent.submit(input.closest('form')!);
    expect(saveMock).toHaveBeenCalledOnce();
    await act(async () => finish({ data: saveMock.mock.lastCall![0], path: dataPath }));
    expect(input).toHaveValue('第二筆');
    expect(input).toHaveFocus();
  });

  it('does not abandon a machine draft when creating another line', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openDefaultSave(user);
    await user.type(screen.getByLabelText('機台名稱'), '未完成機台');
    await user.type(screen.getByLabelText('產線名稱'), 'B線');
    await user.click(screen.getByRole('button', { name: '建立產線' }));
    expect(screen.getByLabelText('機台名稱')).toHaveValue('未完成機台');
    expect(screen.getByText('CNC-01')).toBeInTheDocument();
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await user.click(screen.getByText('B線', { selector: 'strong' }));
    expect(screen.getByLabelText('機台名稱')).toHaveValue('未完成機台');
    expect(screen.getByText('CNC-01')).toBeInTheDocument();
  });

  it('keeps editing on the second line after save and reports clean state', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openDefaultSave(user);
    await user.type(screen.getByLabelText('產線名稱'), 'B線');
    await user.click(screen.getByRole('button', { name: '建立產線' }));
    await user.click(screen.getByRole('button', { name: '編輯 B線' }));
    expect(screen.getByText('已儲存')).toBeInTheDocument();
    await user.type(screen.getByLabelText('描述'), '第二產線');
    await user.click(screen.getByRole('button', { name: '儲存產線' }));
    expect(screen.queryByText('CNC-01')).not.toBeInTheDocument();
    expect(screen.getByText('第二產線')).toBeInTheDocument();
  });

  it('preserves the parent of a draft typed while creating a line', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openDefaultSave(user);
    let finish!: (value: { data: FactoryData; path: string }) => void;
    saveMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await user.type(screen.getByLabelText('產線名稱'), 'B線');
    await user.click(screen.getByRole('button', { name: '建立產線' }));
    await user.type(screen.getByLabelText('機台名稱'), 'A線的新機台');
    await act(async () => finish({ data: saveMock.mock.lastCall![0], path: dataPath }));
    expect(screen.getByLabelText('機台名稱')).toHaveValue('A線的新機台');
    expect(screen.getByText('CNC-01')).toBeInTheDocument();
  });

});
