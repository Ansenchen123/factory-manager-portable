import type { Consumable, FactoryData, Machine, ProductionLine } from './schema';

export type CardLocation = { kind: 'line'; id: string } | { kind: 'machine'; id: string; lineId: string };
export type DropPosition = 'before' | 'after';

function insertRelative<T extends { id: string }>(items: T[], item: T, targetId: string, position: DropPosition): T[] {
  const remaining = items.filter(entry => entry.id !== item.id);
  const index = remaining.findIndex(entry => entry.id === targetId);
  remaining.splice(index + (position === 'after' ? 1 : 0), 0, item);
  return remaining;
}

// A machine dropped on a line moves to its end, including an empty line.
// Invalid/self drops return the original object and never trigger a write.
export function dropCard(data: FactoryData, source: CardLocation, target: CardLocation, position: DropPosition, timestamp: string): FactoryData {
  if (source.kind === target.kind && source.id === target.id) return data;
  let lines = data.productionLines;
  if (source.kind === 'line') {
    const line = lines.find(item => item.id === source.id);
    if (!line || target.kind !== 'line' || !lines.some(item => item.id === target.id)) return data;
    lines = insertRelative(lines, line, target.id, position);
  } else {
    const from = lines.find(line => line.id === source.lineId);
    const to = lines.find(line => line.id === (target.kind === 'line' ? target.id : target.lineId));
    const machine = from?.machines.find(item => item.id === source.id);
    if (!from || !to || !machine || (target.kind === 'machine' && !to.machines.some(item => item.id === target.id))) return data;
    const moved = { ...machine, updatedAt: timestamp };
    const destination = target.kind === 'line'
      ? [...to.machines.filter(item => item.id !== source.id), moved]
      : insertRelative(to.machines, moved, target.id, position);
    if (from.id === to.id && destination.every((item, index) => item.id === to.machines[index]?.id)) return data;
    lines = lines.map(line => line.id === to.id ? { ...line, machines: destination, updatedAt: timestamp }
      : line.id === from.id ? { ...line, machines: line.machines.filter(item => item.id !== source.id), updatedAt: timestamp } : line);
  }
  if (lines.every((line, index) => line === data.productionLines[index])) return data;
  return { ...data, productionLines: lines, updatedAt: timestamp };
}

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
