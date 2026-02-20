import { z } from 'zod';

const fuelTypeEnum = z.enum(['ESSENCE', 'GASOIL', 'PETROLE']);
const replenishmentStatusEnum = z.enum([
  'DRAFT', 'PENDING_VALIDATION', 'VALIDATED', 'ORDERED', 'COMPLETED',
]);
const deliveryStatusEnum = z.enum(['IN_PROGRESS', 'VALIDATED', 'DISPUTED']);
export const compartmentStatusEnum = z.enum(['VALIDATED', 'DISPUTED']);
export const supplierCategoryEnum = z.enum([
  'FUEL_SUPPLY', 'MAINTENANCE', 'UTILITIES', 'EQUIPMENT', 'OTHER',
]);

// ─── Supplier ───
export const createSupplierSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  taxId: z.string().min(1, 'Tax ID is required'),
  email: z.string().email('Invalid email'),
  phone: z.string().min(1, 'Phone is required'),
  category: supplierCategoryEnum,
  address: z.string().optional(),
});
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;

export const updateSupplierSchema = createSupplierSchema.partial();
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;

// ─── Replenishment Request ───
export const createReplenishmentSchema = z.object({
  stationId: z.string().uuid(),
  fuelType: fuelTypeEnum,
  requestedVolume: z.number().positive('Volume must be positive'),
});
export type CreateReplenishmentInput = z.infer<typeof createReplenishmentSchema>;

export const submitReplenishmentSchema = z.object({
  stationId: z.string().uuid(),
});

export const validateReplenishmentSchema = z.object({
  comment: z.string().optional(),
});

export const replenishmentResponseSchema = z.object({
  id: z.string().uuid(),
  stationId: z.string().uuid(),
  fuelType: fuelTypeEnum,
  requestedVolume: z.number(),
  status: replenishmentStatusEnum,
  requestedBy: z.string().uuid(),
  createdAt: z.string().datetime(),
  // Ullage info
  tankCapacity: z.number().optional(),
  currentLevel: z.number().optional(),
  ullage: z.number().optional(),
  overflowWarning: z.boolean().optional(),
});
export type ReplenishmentResponse = z.infer<typeof replenishmentResponseSchema>;

// ─── Fuel Delivery ───
export const createDeliverySchema = z.object({
  stationId: z.string().uuid(),
  replenishmentRequestId: z.string().uuid().optional(),
  blNumber: z.string().min(1, 'BL number is required'),
  blTotalVolume: z.number().positive('BL total volume must be positive').optional(),
  truckPlate: z.string().min(1, 'Truck plate is required'),
  driverName: z.string().min(1, 'Driver name is required'),
});
export type CreateDeliveryInput = z.infer<typeof createDeliverySchema>;

export const addCompartmentSchema = z.object({
  tankId: z.string().uuid(),
  fuelType: fuelTypeEnum,
  blVolume: z.number().positive('BL volume must be positive'),
});
export type AddCompartmentInput = z.infer<typeof addCompartmentSchema>;

export const recordDipsSchema = z.object({
  compartments: z.array(
    z.object({
      compartmentId: z.string().uuid(),
      openingDip: z.number().nonnegative(),
      closingDip: z.number().nonnegative(),
    }),
  ).min(1, 'At least one compartment dip is required'),
});
export type RecordDipsInput = z.infer<typeof recordDipsSchema>;

export const deliveryResponseSchema = z.object({
  id: z.string().uuid(),
  stationId: z.string().uuid(),
  blNumber: z.string(),
  truckPlate: z.string(),
  driverName: z.string(),
  status: deliveryStatusEnum,
  globalVariance: z.number().nullable(),
  createdAt: z.string().datetime(),
});
export type DeliveryResponse = z.infer<typeof deliveryResponseSchema>;

// ─── List Filters ───
export const supplyListFiltersSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  stationId: z.string().uuid().optional(),
  status: z.string().optional(),
  fuelType: fuelTypeEnum.optional(),
});
export type SupplyListFilters = z.infer<typeof supplyListFiltersSchema>;
