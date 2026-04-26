import { z } from 'zod';

const isoDateString = z.string().datetime({ offset: true });

export const consumableSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  sku: z.string().optional(),
  maintenanceIntervalDays: z.number().int().positive(),
  notes: z.string().optional(),
  lastMaintainedAt: isoDateString.optional(),
  createdAt: isoDateString,
  updatedAt: isoDateString,
});

export const machineSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  code: z.string().optional(),
  model: z.string().optional(),
  location: z.string().optional(),
  consumables: z.array(consumableSchema),
  createdAt: isoDateString,
  updatedAt: isoDateString,
});

export const productionLineSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  machines: z.array(machineSchema),
  createdAt: isoDateString,
  updatedAt: isoDateString,
});

export const factoryDataSchema = z.object({
  schemaVersion: z.literal(1),
  productionLines: z.array(productionLineSchema),
  updatedAt: isoDateString,
});

export type Consumable = z.infer<typeof consumableSchema>;
export type Machine = z.infer<typeof machineSchema>;
export type ProductionLine = z.infer<typeof productionLineSchema>;
export type FactoryData = z.infer<typeof factoryDataSchema>;

export function createEmptyFactoryData(now = new Date()): FactoryData {
  return {
    schemaVersion: 1,
    productionLines: [],
    updatedAt: now.toISOString(),
  };
}

export function validateFactoryData(data: unknown): FactoryData {
  return factoryDataSchema.parse(data);
}
