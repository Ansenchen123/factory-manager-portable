import { describe, expect, it } from 'vitest';
import type { Consumable } from '../shared/schema';
import { getMaintenanceInfo, markConsumableMaintained, parseCalendarDate } from '../shared/maintenance';

const baseConsumable: Consumable = {
  id: 'consumable-1',
  name: '切削液',
  maintenanceIntervalDays: 10,
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-01T00:00:00.000Z',
};

describe('maintenance reminders', () => {
  it('uses a planned date until maintenance is completed', () => {
    const planned = { ...baseConsumable, plannedMaintenanceDate: '2026-05-01' };
    expect(getMaintenanceInfo(planned, new Date(2026, 3, 30, 23)).daysRemaining).toBe(1);
    const done = markConsumableMaintained(planned, new Date(2026, 4, 1, 10));
    expect(done.plannedMaintenanceDate).toBeUndefined();
    expect(getMaintenanceInfo(done, new Date(2026, 4, 1, 23)).daysRemaining).toBe(10);
  });

  it('compares local calendar dates across midnight', () => {
    const item = { ...baseConsumable, maintenanceIntervalDays: 1, createdAt: new Date(2026, 8, 8, 23).toISOString() };
    expect(getMaintenanceInfo(item, new Date(2026, 8, 9, 1)).daysRemaining).toBe(0);
  });

  it('validates leap years and typed date formats', () => {
    expect(parseCalendarDate('2028-02-29')).toBeInstanceOf(Date);
    for (const value of ['2027-02-29', '2026-13-01', '115-09-08', '2026-2-3']) {
      expect(parseCalendarDate(value)).toBeUndefined();
    }
  });
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
