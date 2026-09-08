import { describe, expect, it } from 'vitest';
import { copyItem, moveItem } from '../shared/items';

describe('item organization', () => {
  it('moves items without mutating the source or crossing boundaries', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(moveItem(items, 'b', 1).map(item => item.id)).toEqual(['a', 'c', 'b']);
    expect(items.map(item => item.id)).toEqual(['a', 'b', 'c']);
    expect(moveItem(items, 'a', -1)).toBe(items);
    expect(moveItem(items, 'c', 1)).toBe(items);
    expect(moveItem(items, 'missing', 1)).toBe(items);
  });
  it('copies a hierarchy without copying service history or sharing child arrays', () => {
    const timestamp = '2026-09-08T00:00:00.000Z';
    const dates = { createdAt: timestamp, updatedAt: timestamp };
    const line = { id: 'l', name: 'A', ...dates, machines: [{ id: 'm', name: '機台', ...dates,
      consumables: [{ id: 'c', name: '濾芯', maintenanceIntervalDays: 30, ...dates,
        lastMaintainedAt: timestamp, plannedMaintenanceDate: '2026-10-01' }] }] };
    let id = 0;
    const copy = copyItem(line, timestamp, () => String(++id));
    expect([copy.id, copy.machines[0].id, copy.machines[0].consumables[0].id]).toEqual(['1', '2', '3']);
    expect(copy.machines).not.toBe(line.machines);
    expect(copy.machines[0].consumables[0].lastMaintainedAt).toBeUndefined();
    expect(copy.machines[0].consumables[0].plannedMaintenanceDate).toBeUndefined();
    expect(line.machines[0].consumables[0].lastMaintainedAt).toBe(timestamp);
  });
});
