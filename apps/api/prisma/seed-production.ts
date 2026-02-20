/**
 * ════════════════════════════════════════════════════════════════════════════════
 * ALCOM V4 — Production Seed Script
 * ════════════════════════════════════════════════════════════════════════════════
 * 
 * This script seeds ONLY essential production data:
 * - SUPER_ADMIN account
 * - Station master data (codes provided by client)
 * - Checklist templates
 * - Supplier list
 * - Initial fuel prices
 * 
 * NO TEST DATA IS CREATED
 * 
 * Usage: pnpm db:seed:prod
 * ════════════════════════════════════════════════════════════════════════════════
 */

import {
  PrismaClient,
  FuelType,
  NozzleSide,
  SupplierCategory,
  PriceStatus
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { v4 as uuid } from 'uuid';
import Decimal from 'decimal.js';

const prisma = new PrismaClient();

// ════════════════════════════════════════════════════════════════════════════════
// CONFIGURATION - Client-provided data
// Update these values with actual client data before running
// ════════════════════════════════════════════════════════════════════════════════

const CONFIG = {
  // Super Admin credentials (CHANGE THESE IN PRODUCTION!)
  admin: {
    email: 'admin@alcom.cm',
    password: 'ChangeThisPassword2026!', // MUST be changed before first login
    fullName: 'System Administrator',
  },

  // Station master data (update with client-provided data)
  stations: [
    { code: 'ST-DLA-001', name: 'Station Douala Centre' },
    { code: 'ST-DLA-002', name: 'Station Akwa' },
    { code: 'ST-DLA-003', name: 'Station Bonaberi' },
    { code: 'ST-YDE-001', name: 'Station Yaoundé Centre' },
    { code: 'ST-YDE-002', name: 'Station Messa' },
    // Add more stations as needed
  ],

  // Current fuel prices (FCFA per liter) - update with actual prices
  prices: {
    ESSENCE: 730,
    GASOIL: 720,
  },

  // Tank configuration per station
  tankCapacity: 30000, // liters

  // Initial tank levels (% of capacity)
  initialTankLevel: 0.50, // 50%

  // Supplier list (update with actual suppliers)
  suppliers: [
    { name: 'SCDP Cameroun', taxId: 'CM-SCDP-001', category: SupplierCategory.FUEL_SUPPLY, email: 'contact@scdp.cm', phone: '+237699000001' },
    { name: 'TOTAL Energies', taxId: 'CM-TOTAL-001', category: SupplierCategory.FUEL_SUPPLY, email: 'contact@total.cm', phone: '+237699000002' },
    { name: 'Tradex SA', taxId: 'CM-TRADEX-001', category: SupplierCategory.FUEL_SUPPLY, email: 'contact@tradex.cm', phone: '+237699000003' },
    { name: 'ENEO', taxId: 'CM-ENEO-001', category: SupplierCategory.UTILITIES, email: 'contact@eneo.cm', phone: '+237699000004' },
    { name: 'Camwater', taxId: 'CM-CAMWATER-001', category: SupplierCategory.UTILITIES, email: 'contact@camwater.cm', phone: '+237699000005' },
    { name: 'Express Maintenance', taxId: 'CM-EXPRMAINT-001', category: SupplierCategory.MAINTENANCE, email: 'contact@expressmaint.cm', phone: '+237699000006' },
  ],
};

// ════════════════════════════════════════════════════════════════════════════════
// SEED FUNCTIONS
// ════════════════════════════════════════════════════════════════════════════════

async function seedSuperAdmin() {
  console.log('🔐 Creating Super Admin account...');

  const passwordHash = await bcrypt.hash(CONFIG.admin.password, 12);

  const admin = await prisma.user.upsert({
    where: { email: CONFIG.admin.email },
    update: {
      passwordHash,
      fullName: CONFIG.admin.fullName,
      isActive: true,
    },
    create: {
      id: uuid(),
      email: CONFIG.admin.email,
      passwordHash,
      fullName: CONFIG.admin.fullName,
      role: 'SUPER_ADMIN',
      isActive: true,
    },
  });

  console.log(`   ✓ Super Admin created: ${admin.email}`);
  console.log('   ⚠️  IMPORTANT: Change the password immediately after first login!');

  return admin;
}

async function seedStations() {
  console.log('\n🏪 Creating stations...');

  const fuelTypes: FuelType[] = [FuelType.ESSENCE, FuelType.GASOIL];
  const createdStations = [];

  for (const stationDef of CONFIG.stations) {
    // Check if station exists
    const existing = await prisma.station.findUnique({
      where: { code: stationDef.code },
    });

    if (existing) {
      console.log(`   ⚠️  Station ${stationDef.code} already exists, skipping...`);
      createdStations.push(existing);
      continue;
    }

    const stationId = uuid();

    // Create station
    const station = await prisma.station.create({
      data: {
        id: stationId,
        code: stationDef.code,
        name: stationDef.name,
        settings: {
          alertThreshold: 25,
          criticalThreshold: 15,
          timezone: 'Africa/Douala',
        },
        isActive: true,
      },
    });

    // Create tanks and pumps for each fuel type
    const tanks: { id: string; fuelType: FuelType }[] = [];
    for (const fuelType of fuelTypes) {
      const capacity = new Decimal(CONFIG.tankCapacity);
      const currentLevel = new Decimal(capacity.times(CONFIG.initialTankLevel).toFixed(0));

      const tank = await prisma.tank.create({
        data: {
          id: uuid(),
          stationId: stationId,
          fuelType,
          capacity,
          currentLevel,
        },
      });
      tanks.push({ id: tank.id, fuelType });
    }

    // Create 3 pumps per station, each with 2 nozzles (sides A, B)
    for (let pumpIndex = 0; pumpIndex < 3; pumpIndex++) {
      const tank = tanks[pumpIndex % tanks.length];
      const pump = await prisma.pump.create({
        data: {
          id: uuid(),
          stationId: stationId,
          code: `P${pumpIndex + 1}`,
          tankId: tank.id,
        },
      });

      // Create 2 nozzles per pump (sides A and B)
      const sides: NozzleSide[] = [NozzleSide.A, NozzleSide.B];
      for (const side of sides) {
        await prisma.nozzle.create({
          data: {
            id: uuid(),
            pumpId: pump.id,
            side,
            meterIndex: new Decimal(10000),
          },
        });
      }
    }

    createdStations.push(station);
    console.log(`   ✓ Station created: ${stationDef.code} - ${stationDef.name}`);
  }

  return createdStations;
}

async function seedSuppliers() {
  console.log('\n📦 Creating suppliers...');

  for (const sup of CONFIG.suppliers) {
    const existing = await prisma.supplier.findFirst({
      where: { taxId: sup.taxId },
    });

    if (existing) {
      console.log(`   ⚠️  Supplier ${sup.name} already exists, skipping...`);
      continue;
    }

    await prisma.supplier.create({
      data: {
        id: uuid(),
        name: sup.name,
        taxId: sup.taxId,
        category: sup.category,
        email: sup.email,
        phone: sup.phone,
        address: '',
        isActive: true,
      },
    });

    console.log(`   ✓ Supplier created: ${sup.name}`);
  }
}

async function seedFuelPrices(adminId: string) {
  console.log('\n⛽ Creating fuel prices...');

  const fuelTypes: FuelType[] = [FuelType.ESSENCE, FuelType.GASOIL];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const fuelType of fuelTypes) {
    const priceValue = CONFIG.prices[fuelType];

    // Check if active price exists
    const existing = await prisma.fuelPrice.findFirst({
      where: {
        fuelType,
        isActive: true,
      },
    });

    if (existing) {
      console.log(`   ⚠️  Active price for ${fuelType} already exists, skipping...`);
      continue;
    }

    await prisma.fuelPrice.create({
      data: {
        id: uuid(),
        fuelType,
        price: new Decimal(priceValue),
        status: PriceStatus.APPROVED,
        isActive: true,
        effectiveDate: today,
        createdById: adminId,
        approvedById: adminId,
        approvedAt: today,
      },
    });

    console.log(`   ✓ Price set: ${fuelType} = ${priceValue} FCFA/L`);
  }
}

async function seedChecklistTemplates() {
  console.log('\n📋 Creating checklist templates...');

  // Check if templates exist
  const existingCount = await prisma.checklistTemplate.count({
    where: { isActive: true },
  });

  if (existingCount > 0) {
    console.log(`   ⚠️  ${existingCount} active template(s) already exist, skipping...`);
    return;
  }

  // Daily Station Inspection Template
  await prisma.checklistTemplate.create({
    data: {
      id: uuid(),
      name: 'Inspection Quotidienne Station',
      version: 1,
      categories: {
        categories: [
          {
            name: 'Sécurité',
            items: [
              { id: '1', label: 'Extincteurs vérifiés et accessibles', required: true },
              { id: '2', label: 'Issues de secours dégagées', required: true },
              { id: '3', label: 'Éclairage de sécurité fonctionnel', required: true },
              { id: '4', label: 'Signalisation visible et en bon état', required: true },
              { id: '5', label: 'Kit de premiers secours complet', required: true },
            ],
          },
          {
            name: 'Équipements',
            items: [
              { id: '6', label: 'Toutes les pompes fonctionnelles', required: true },
              { id: '7', label: 'Affichage des prix à jour', required: true },
              { id: '8', label: 'Compteurs/totaliseurs calibrés', required: false },
              { id: '9', label: 'Pistolets en bon état (pas de fuite)', required: true },
              { id: '10', label: 'Terminal de paiement fonctionnel', required: true },
            ],
          },
          {
            name: 'Propreté & Hygiène',
            items: [
              { id: '11', label: 'Piste propre et sans déversement', required: true },
              { id: '12', label: 'Toilettes propres et approvisionnées', required: false },
              { id: '13', label: 'Boutique propre et rangée', required: false },
              { id: '14', label: 'Poubelles vidées', required: true },
            ],
          },
          {
            name: 'Stockage Carburant',
            items: [
              { id: '15', label: 'Niveaux des cuves relevés', required: true },
              { id: '16', label: 'Pas de fuite détectée', required: true },
              { id: '17', label: 'Vannes fermées et scellées', required: true },
              { id: '18', label: 'Zone de dépotage sécurisée', required: true },
            ],
          },
        ],
      },
      isActive: true,
    },
  });

  console.log('   ✓ Daily Inspection template created (18 items)');

  // Monthly Equipment Check Template
  await prisma.checklistTemplate.create({
    data: {
      id: uuid(),
      name: 'Contrôle Mensuel Équipements',
      version: 1,
      categories: {
        categories: [
          {
            name: 'Pompes et Distributeurs',
            items: [
              { id: '1', label: 'Calibration vérifiée par service métrologie', required: true },
              { id: '2', label: 'Joints et flexibles inspectés', required: true },
              { id: '3', label: 'Filtres nettoyés ou remplacés', required: true },
              { id: '4', label: 'Afficheurs testés', required: true },
            ],
          },
          {
            name: 'Cuves et Canalisations',
            items: [
              { id: '5', label: 'Inspection visuelle des cuves', required: true },
              { id: '6', label: 'Test d\'étanchéité effectué', required: true },
              { id: '7', label: 'Évents vérifiés', required: true },
              { id: '8', label: 'Jauges de niveau calibrées', required: true },
            ],
          },
          {
            name: 'Sécurité Incendie',
            items: [
              { id: '9', label: 'Extincteurs inspectés et rechargés si nécessaire', required: true },
              { id: '10', label: 'Système de détection incendie testé', required: true },
              { id: '11', label: 'Arrêts d\'urgence testés', required: true },
            ],
          },
        ],
      },
      isActive: true,
    },
  });

  console.log('   ✓ Monthly Equipment Check template created (11 items)');
}

// ════════════════════════════════════════════════════════════════════════════════
// MAIN FUNCTION
// ════════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('  ALCOM V4 — Production Seed');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`  Time: ${new Date().toISOString()}`);
  console.log('════════════════════════════════════════════════════════════════\n');

  // Safety check
  if (process.env.NODE_ENV !== 'production') {
    console.log('⚠️  WARNING: Running production seed in non-production environment');
    console.log('   This will create minimal production-ready data.\n');
  }

  try {
    const admin = await seedSuperAdmin();
    await seedStations();
    await seedSuppliers();
    await seedFuelPrices(admin.id);
    await seedChecklistTemplates();

    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('  ✅ Production seed completed successfully!');
    console.log('════════════════════════════════════════════════════════════════');
    console.log('\n📝 Next steps:');
    console.log('   1. Change the Super Admin password immediately');
    console.log('   2. Create user accounts for station managers');
    console.log('   3. Verify fuel prices are current');
    console.log('   4. Review station configuration');
    console.log('');

  } catch (error) {
    console.error('\n❌ Error during seed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();
