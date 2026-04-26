import { render, screen, waitFor, within } from '@testing-library/react';
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
  await screen.findByText('A線');
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

    await user.click(screen.getByRole('button', { name: '標記已維護' }));

    await waitFor(() => {
      const savedData = saveMock.mock.lastCall?.[0] as FactoryData | undefined;
      const savedConsumable =
        savedData?.productionLines[0]?.machines[0]?.consumables.find((consumable) => consumable.id === 'consumable-1');

      expect(savedConsumable?.lastMaintainedAt).toEqual(expect.any(String));
    });
  });
});
