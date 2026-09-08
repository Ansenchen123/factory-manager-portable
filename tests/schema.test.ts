import { describe, expect, it } from 'vitest';
import { consumableSchema, createEmptyFactoryData, validateFactoryData } from '../shared/schema';

describe('factory data schema', () => {
  it('preserves planned dates while remaining compatible with existing records', () => {
    const item = { id: 'c', name: '濾芯', maintenanceIntervalDays: 30,
      createdAt: '2026-04-26T00:00:00.000Z', updatedAt: '2026-04-26T00:00:00.000Z' };
    expect(consumableSchema.parse(item)).toEqual(item);
    expect(consumableSchema.parse({ ...item, plannedMaintenanceDate: '2028-02-29' }).plannedMaintenanceDate).toBe('2028-02-29');
    expect(() => consumableSchema.parse({ ...item, plannedMaintenanceDate: '2027-02-29' })).toThrow();
  });
  it('creates valid empty factory data', () => {
    const data = createEmptyFactoryData(new Date('2026-04-26T00:00:00.000Z'));

    expect(validateFactoryData(data)).toEqual({
      schemaVersion: 1,
      productionLines: [],
      updatedAt: '2026-04-26T00:00:00.000Z',
    });
  });

  it('rejects consumables with invalid maintenance intervals', () => {
    expect(() =>
      validateFactoryData({
        schemaVersion: 1,
        updatedAt: '2026-04-26T00:00:00.000Z',
        productionLines: [
          {
            id: 'line-1',
            name: 'A線',
            machines: [
              {
                id: 'machine-1',
                name: 'CNC-01',
                consumables: [
                  {
                    id: 'consumable-1',
                    name: '濾芯',
                    maintenanceIntervalDays: -1,
                    createdAt: '2026-04-26T00:00:00.000Z',
                    updatedAt: '2026-04-26T00:00:00.000Z',
                  },
                ],
                createdAt: '2026-04-26T00:00:00.000Z',
                updatedAt: '2026-04-26T00:00:00.000Z',
              },
            ],
            createdAt: '2026-04-26T00:00:00.000Z',
            updatedAt: '2026-04-26T00:00:00.000Z',
          },
        ],
      }),
    ).toThrow();
  });
});
