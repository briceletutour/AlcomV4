import { z } from 'zod';

const fuelTypeEnum = z.enum(['ESSENCE', 'GASOIL', 'PETROLE']);
const nozzleSideEnum = z.enum(['A', 'B']);

// ─── Tank ───
export const createTankSchema = z.object({
  fuelType: fuelTypeEnum,
  capacity: z.number().positive('Capacity must be positive'),
  currentLevel: z.number().nonnegative().default(0),
  tempId: z.string().optional(), // temporary client-side ID for pump linking during wizard
});
export type CreateTankInput = z.infer<typeof createTankSchema>;

export const updateTankSchema = z.object({
  capacity: z.number().positive().optional(),
  currentLevel: z.number().nonnegative().optional(),
});
export type UpdateTankInput = z.infer<typeof updateTankSchema>;

// ─── Pump ───
export const createPumpSchema = z.object({
  code: z.string().min(1, 'Pump code is required'),
  tankId: z.string().min(1, 'Tank ID is required'), // Can be UUID or tempId during wizard
});
export type CreatePumpInput = z.infer<typeof createPumpSchema>;

// ─── Station ───
export const createStationSchema = z.object({
  code: z
    .string()
    .min(3, 'Code is required')
    .regex(/^ST-[A-Z]{3}-\d{3}$/, 'Code must follow format ST-XXX-000'),
  name: z.string().min(2, 'Name is required'),
  settings: z
    .object({
      tolerance: z
        .object({
          cashVariance: z.number().nonnegative().default(5000),
          stockVariance: z.number().nonnegative().default(50),
        })
        .default({}),
      openingHours: z
        .object({
          morning: z.string().default('06:00'),
          evening: z.string().default('18:00'),
        })
        .default({}),
    })
    .default({}),
  // Optional nested tanks & pumps for wizard-style creation
  tanks: z.array(createTankSchema).optional(),
  pumps: z.array(createPumpSchema).optional(),
});
export type CreateStationInput = z.infer<typeof createStationSchema>;

export const updateStationSchema = z.object({
  name: z.string().min(2).optional(),
  settings: z
    .object({
      tolerance: z
        .object({
          cashVariance: z.number().nonnegative().optional(),
          stockVariance: z.number().nonnegative().optional(),
        })
        .optional(),
      openingHours: z
        .object({
          morning: z.string().optional(),
          evening: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  isActive: z.boolean().optional(),
});
export type UpdateStationInput = z.infer<typeof updateStationSchema>;

export const stationResponseSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  settings: z.record(z.unknown()),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
});
export type StationResponse = z.infer<typeof stationResponseSchema>;

export const stationListFiltersSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  isActive: z.coerce.boolean().optional(),
  search: z.string().optional(),
});
export type StationListFilters = z.infer<typeof stationListFiltersSchema>;

// ─── Station Settings ───
export const updateStationSettingsSchema = z.object({
  tolerance: z
    .object({
      cashVariance: z.number().nonnegative().optional(),
      stockVariance: z.number().nonnegative().optional(),
    })
    .optional(),
  openingHours: z
    .object({
      morning: z.string().regex(/^\d{2}:\d{2}$/, 'Format HH:MM required').optional(),
      evening: z.string().regex(/^\d{2}:\d{2}$/, 'Format HH:MM required').optional(),
    })
    .optional(),
});
export type UpdateStationSettingsInput = z.infer<typeof updateStationSettingsSchema>;

// ─── Nozzle ───
export const nozzleSchema = z.object({
  id: z.string().uuid(),
  pumpId: z.string().uuid(),
  side: nozzleSideEnum,
  meterIndex: z.number().nonnegative(),
});
export type NozzleResponse = z.infer<typeof nozzleSchema>;
