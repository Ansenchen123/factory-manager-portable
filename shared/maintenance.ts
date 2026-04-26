import type { Consumable } from './schema';

export type MaintenanceStatus = 'ok' | 'soon' | 'due';

export type MaintenanceInfo = {
  basisDate: Date;
  nextMaintenanceDate: Date;
  daysRemaining: number;
  status: MaintenanceStatus;
};

const millisecondsPerDay = 24 * 60 * 60 * 1000;

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
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
  const nextMaintenanceDate = addDays(basisDate, consumable.maintenanceIntervalDays);
  const daysRemaining = Math.ceil(
    (startOfUtcDay(nextMaintenanceDate).getTime() - startOfUtcDay(today).getTime()) / millisecondsPerDay,
  );
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
    updatedAt: timestamp,
  };
}
