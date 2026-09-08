import type { Consumable } from './schema';

export type MaintenanceStatus = 'ok' | 'soon' | 'due';

export type MaintenanceInfo = {
  basisDate: Date;
  nextMaintenanceDate: Date;
  daysRemaining: number;
  status: MaintenanceStatus;
};

const millisecondsPerDay = 24 * 60 * 60 * 1000;

export function localDateString(value = new Date()): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

export function parseCalendarDate(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) && localDateString(date) === value ? date : undefined;
}

function localDayNumber(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / millisecondsPerDay;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function getMaintenanceInfo(consumable: Consumable, today = new Date()): MaintenanceInfo {
  if (!Number.isInteger(consumable.maintenanceIntervalDays) || consumable.maintenanceIntervalDays <= 0) {
    throw new Error('maintenanceIntervalDays must be a positive integer');
  }

  const basisDate = new Date(consumable.lastMaintainedAt ?? consumable.createdAt);
  const nextMaintenanceDate = (consumable.plannedMaintenanceDate && parseCalendarDate(consumable.plannedMaintenanceDate))
    || addDays(basisDate, consumable.maintenanceIntervalDays);
  const daysRemaining = localDayNumber(nextMaintenanceDate) - localDayNumber(today);
  const status: MaintenanceStatus = daysRemaining <= 0 ? 'due' : daysRemaining <= 7 ? 'soon' : 'ok';

  return {
    basisDate,
    nextMaintenanceDate,
    daysRemaining,
    status,
  };
}

export function markConsumableMaintained(consumable: Consumable, maintainedAt = new Date()): Consumable {
  const timestamp = maintainedAt.toISOString();

  return {
    ...consumable,
    lastMaintainedAt: timestamp,
    plannedMaintenanceDate: undefined,
    updatedAt: timestamp,
  };
}
