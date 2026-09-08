import type { Consumable, Machine, ProductionLine } from './schema';

export function moveItem<T extends { id: string }>(items: T[], id: string, direction: -1 | 1): T[] {
  const index = items.findIndex(item => item.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= items.length) return items;
  const result = [...items];
  [result[index], result[target]] = [result[target], result[index]];
  return result;
}

// Copies are new equipment records; maintenance history belongs to the source.
export function copyItem<T extends ProductionLine | Machine | Consumable>(item: T, timestamp: string, id: () => string): T {
  const copy = { ...item, id: id(), createdAt: timestamp, updatedAt: timestamp };
  if ('machines' in copy) copy.machines = copy.machines.map(machine => copyItem(machine, timestamp, id));
  if ('consumables' in copy) copy.consumables = copy.consumables.map(consumable => copyItem(consumable, timestamp, id));
  if ('maintenanceIntervalDays' in copy) {
    copy.lastMaintainedAt = undefined;
    copy.plannedMaintenanceDate = undefined;
  }
  return copy;
}
