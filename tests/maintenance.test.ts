import { describe, expect, it } from 'vitest';
import type { Consumable } from '../shared/schema';
import { getMaintenanceInfo, markConsumableMaintained } from '../shared/maintenance';

const baseConsumable: Consumable = {
  id: 'consumable-1',
  name: '切削液',
  maintenanceIntervalDays: 10,
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-01T00:00:00.000Z',
};

describe('maintenance reminders', () => {
  it('marks consumables as ok when the next maintenance date is more than seven days away', () => {
    const info = getMaintenanceInfo(baseConsumable, new Date('2026-04-02T00:00:00.000Z'));

    expect(info.nextMaintenanceDate.toISOString()).toBe('2026-04-11T00:00:00.000Z');
    expect(info.daysRemaining).toBe(9);
    expect(info.status).toBe('ok');
  });

  it('marks consumables as soon when maintenance is within seven days', () => {
    const info = getMaintenanceInfo(baseConsumable, new Date('2026-04-07T00:00:00.000Z'));

    expect(info.daysRemaining).toBe(4);
    expect(info.status).toBe('soon');
  });

  it('marks consumables as due when the maintenance date has arrived', () => {
    const info = getMaintenanceInfo(baseConsumable, new Date('2026-04-11T00:00:00.000Z'));

    expect(info.daysRemaining).toBe(0);
    expect(info.status).toBe('due');
  });

  it('resets future reminders from the last maintained time', () => {
    const maintained = markConsumableMaintained(baseConsumable, new Date('2026-04-12T00:00:00.000Z'));
    const info = getMaintenanceInfo(maintained, new Date('2026-04-13T00:00:00.000Z'));

    expect(maintained.lastMaintainedAt).toBe('2026-04-12T00:00:00.000Z');
    expect(info.nextMaintenanceDate.toISOString()).toBe('2026-04-22T00:00:00.000Z');
    expect(info.status).toBe('ok');
  });

  it('rejects non-positive maintenance intervals', () => {
    expect(() =>
      getMaintenanceInfo(
        {
          ...baseConsumable,
          maintenanceIntervalDays: 0,
        },
        new Date('2026-04-01T00:00:00.000Z'),
      ),
    ).toThrow('maintenanceIntervalDays must be a positive integer');
  });
});
