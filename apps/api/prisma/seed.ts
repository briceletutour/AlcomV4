import { PrismaClient, FuelType, ShiftType, NozzleSide, InvoiceStatus, ExpenseStatus, ExpenseCategory, MailPriority, MailStatus, ReplenishmentStatus, IncidentStatus, PriceStatus, ApprovalAction, ApprovalEntityType, SupplierCategory, DisbursementMethod } from '@prisma/client';
import bcrypt from 'bcrypt';
import { v4 as uuid } from 'uuid';
import Decimal from 'decimal.js';

const prisma = new PrismaClient();

// ────────────── helpers ──────────────
function randomBetween(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 10000) / 10000;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(6, 0, 0, 0);
  return d;
}

function hoursAgo(n: number): Date {
  const d = new Date();
  d.setHours(d.getHours() - n);
  return d;
}

function randomDate(daysBack: number, daysForward: number = 0): Date {
  const days = Math.floor(Math.random() * (daysBack + daysForward)) - daysForward;
  return daysAgo(days);
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function main() {
  console.log('🌱 Seeding Alcom V4 database with comprehensive mock data…');

  // ────────────── 1. Users ──────────────
  const passwordHash = await bcrypt.hash('Alcom2026!', 10);

  // Super Admin
  const superAdmin = await prisma.user.create({
    data: {
      id: uuid(),
      email: 'admin@alcom.cm',
      passwordHash,
      fullName: 'System ADMIN',
      role: 'SUPER_ADMIN',
      isActive: true,
    },
  });

  // CEO with delegation settings
  const ceo = await prisma.user.create({
    data: {
      id: uuid(),
      email: 'ceo@alcom.cm',
      passwordHash,
      fullName: 'Jean-Pierre KAMGA',
      role: 'CEO',
      isActive: true,
      lastLogin: daysAgo(0),
    },
  });

  // CFO
  const cfo = await prisma.user.create({
    data: {
      id: uuid(),
      email: 'cfo@alcom.cm',
      passwordHash,
      fullName: 'Marie NKENG',
      role: 'CFO',
      isActive: true,
      lastLogin: daysAgo(1),
    },
  });

  // Finance Director
  const financeDir = await prisma.user.create({
    data: {
      id: uuid(),
      email: 'finance@alcom.cm',
      passwordHash,
      fullName: 'Paul TAGNE',
      role: 'FINANCE_DIR',
      isActive: true,
      lastLogin: daysAgo(0),
    },
  });

  // Logistics Manager
  const logistics = await prisma.user.create({
    data: {
      id: uuid(),
      email: 'logistics@alcom.cm',
      passwordHash,
      fullName: 'Serge FOTSO',
      role: 'LOGISTICS',
      isActive: true,
      lastLogin: daysAgo(2),
    },
  });

  // DCO
  const dco = await prisma.user.create({
    data: {
      id: uuid(),
      email: 'dco@alcom.cm',
      passwordHash,
      fullName: 'Alain TCHINDA',
      role: 'DCO',
      isActive: true,
      lastLogin: daysAgo(3),
    },
  });

  // Inactive user for testing filters
  await prisma.user.create({
    data: {
      id: uuid(),
      email: 'inactive@alcom.cm',
      passwordHash,
      fullName: 'Ancien Employé',
      role: 'POMPISTE',
      isActive: false,
      deletedAt: daysAgo(30),
    },
  });

  // Set delegation from CFO to Finance Director
  await prisma.user.update({
    where: { id: cfo.id },
    data: {
      backupApproverId: financeDir.id,
      delegationStart: daysAgo(-5),
      delegationEnd: daysAgo(-10),
    },
  });

  console.log('  ✓ HQ users created (with delegation)');

  // ────────────── 2. Stations ──────────────
  const stationDefs = [
    { code: 'ST-DLA-001', name: 'Station Akwa' },
    { code: 'ST-DLA-002', name: 'Station Bonaberi' },
    { code: 'ST-DLA-003', name: 'Station Deido' },
    { code: 'ST-YDE-001', name: 'Station Mvog-Ada' },
    { code: 'ST-YDE-002', name: 'Station Messa' },
  ];

  const stations: Array<{
    id: string;
    code: string;
    name: string;
    managerId: string;
    chefPisteId: string;
    pompistes: string[];
    tanks: Array<{ id: string; fuelType: FuelType }>;
    nozzles: Array<{ id: string; fuelType: FuelType }>;
  }> = [];

  const managerNames = ['Emmanuel MBARGA', 'Grace FOUDA', 'Eric NJOCK', 'Sylvie MEKA', 'Bernard NKOMO'];
  const chefPisteNames = ['David ESSOMBA', 'Cécile ATANGANA', 'Robert NKOMO', 'Jeanne MBIDA', 'François EWANE'];
  const pompisteNames = [
    ['Ibrahim NJOYA', 'Moussa AMBA', 'Fatimata BELLO'],
    ['Fatou BELLO', 'Samuel EWANE', 'André MESSI'],
    ['André MESSI', 'Pierre KOUAM', 'Thomas NTAMAG'],
    ['Marie TCHAKOUNTE', 'Paul NANA', 'Jacques FOUDA'],
    ['Celestin ETOUNDI', 'Brigitte ABANDA', 'Hervé NGUIMFACK'],
  ];

  for (let si = 0; si < stationDefs.length; si++) {
    const def = stationDefs[si];
    const stationId = uuid();

    // Create station first
    await prisma.station.create({
      data: {
        id: stationId,
        code: def.code,
        name: def.name,
        settings: {
          alertThreshold: 25,
          criticalThreshold: 15,
          timezone: 'Africa/Douala',
        },
        isActive: si < 4, // One inactive station for testing
      },
    });

    // Station manager
    const manager = await prisma.user.create({
      data: {
        id: uuid(),
        email: `manager${si + 1}@alcom.cm`,
        passwordHash,
        fullName: managerNames[si],
        role: 'STATION_MANAGER',
        assignedStationId: stationId,
        isActive: true,
        lastLogin: daysAgo(Math.floor(Math.random() * 5)),
      },
    });

    // Chef de piste
    const chefPiste = await prisma.user.create({
      data: {
        id: uuid(),
        email: `chefpiste${si + 1}@alcom.cm`,
        passwordHash,
        fullName: chefPisteNames[si],
        role: 'CHEF_PISTE',
        assignedStationId: stationId,
        lineManagerId: manager.id,
        isActive: true,
        lastLogin: daysAgo(Math.floor(Math.random() * 3)),
      },
    });

    // 3 pompistes per station
    const pompistes: string[] = [];
    for (let pi = 0; pi < 3; pi++) {
      const p = await prisma.user.create({
        data: {
          id: uuid(),
          email: `pompiste${si * 3 + pi + 1}@alcom.cm`,
          passwordHash,
          fullName: pompisteNames[si][pi],
          role: 'POMPISTE',
          assignedStationId: stationId,
          lineManagerId: chefPiste.id,
          isActive: true,
          lastLogin: daysAgo(Math.floor(Math.random() * 2)),
        },
      });
      pompistes.push(p.id);
    }

    // 2 Tanks per station (ESSENCE 30000L, GASOIL 30000L)
    const tanksArr: Array<{ id: string; fuelType: FuelType }> = [];
    const fuelTypes: FuelType[] = [FuelType.ESSENCE, FuelType.GASOIL];

    for (const fuelType of fuelTypes) {
      const capacity = new Decimal(30000);
      // Vary tank levels to test different alert states
      const levelPercent = si === 0 && fuelType === FuelType.ESSENCE ? 0.15 : // Critical
        si === 1 && fuelType === FuelType.GASOIL ? 0.22 : // Alert
          randomBetween(0.40, 0.90);
      const currentLevel = new Decimal(capacity.times(levelPercent).toFixed(0));

      const tank = await prisma.tank.create({
        data: {
          id: uuid(),
          stationId,
          fuelType,
          capacity,
          currentLevel,
        },
      });
      tanksArr.push({ id: tank.id, fuelType });
    }

    // 3 Pumps per station, each with 2 nozzles (A, B)
    const nozzlesArr: Array<{ id: string; fuelType: FuelType }> = [];
    for (let pi = 0; pi < 3; pi++) {
      const tank = tanksArr[pi % tanksArr.length];
      const pump = await prisma.pump.create({
        data: {
          id: uuid(),
          stationId,
          code: `P${pi + 1}`,
          tankId: tank.id,
        },
      });

      // 2 nozzles per pump (sides A and B)
      const sides: NozzleSide[] = [NozzleSide.A, NozzleSide.B];
      for (const side of sides) {
        const meterIndex = new Decimal(randomBetween(10000, 500000));
        const nozzle = await prisma.nozzle.create({
          data: {
            id: uuid(),
            pumpId: pump.id,
            side,
            meterIndex,
          },
        });
        nozzlesArr.push({ id: nozzle.id, fuelType: tank.fuelType });
      }
    }

    stations.push({
      id: stationId,
      code: def.code,
      name: def.name,
      managerId: manager.id,
      chefPisteId: chefPiste.id,
      pompistes,
      tanks: tanksArr,
      nozzles: nozzlesArr,
    });
  }

  console.log('  ✓ 5 stations with tanks, pumps, nozzles created');

  // ────────────── 3. Fuel Prices (with history and pending) ──────────────
  const prices: Record<FuelType, number> = {
    [FuelType.ESSENCE]: 730,
    [FuelType.GASOIL]: 720,
  };

  // Active prices
  for (const [fuelType, price] of Object.entries(prices)) {
    await prisma.fuelPrice.create({
      data: {
        id: uuid(),
        fuelType: fuelType as FuelType,
        price: new Decimal(price),
        effectiveDate: daysAgo(60),
        status: PriceStatus.APPROVED,
        isActive: true,
        createdById: ceo.id,
        approvedById: ceo.id,
        approvedAt: daysAgo(61),
      },
    });
  }

  // Historical prices
  await prisma.fuelPrice.create({
    data: {
      id: uuid(),
      fuelType: FuelType.ESSENCE,
      price: new Decimal(710),
      effectiveDate: daysAgo(120),
      status: PriceStatus.APPROVED,
      isActive: false,
      createdById: ceo.id,
      approvedById: ceo.id,
      approvedAt: daysAgo(121),
    },
  });

  await prisma.fuelPrice.create({
    data: {
      id: uuid(),
      fuelType: FuelType.GASOIL,
      price: new Decimal(700),
      effectiveDate: daysAgo(120),
      status: PriceStatus.APPROVED,
      isActive: false,
      createdById: ceo.id,
      approvedById: ceo.id,
      approvedAt: daysAgo(121),
    },
  });

  // Pending price change
  await prisma.fuelPrice.create({
    data: {
      id: uuid(),
      fuelType: FuelType.ESSENCE,
      price: new Decimal(745),
      effectiveDate: daysAgo(-7),
      status: PriceStatus.PENDING,
      isActive: false,
      createdById: financeDir.id,
    },
  });

  // Rejected price change
  await prisma.fuelPrice.create({
    data: {
      id: uuid(),
      fuelType: FuelType.GASOIL,
      price: new Decimal(800),
      effectiveDate: daysAgo(10),
      status: PriceStatus.REJECTED,
      isActive: false,
      createdById: financeDir.id,
      rejectedReason: 'Prix trop élevé par rapport au marché',
    },
  });

  console.log('  ✓ Fuel prices set (active, historical, pending, rejected)');

  // ────────────── 4. Suppliers ──────────────
  const supplierData = [
    { name: 'SCDP Cameroun', taxId: 'CM-SCDP-001', category: SupplierCategory.FUEL_SUPPLY },
    { name: 'TOTAL Energies', taxId: 'CM-TOTAL-001', category: SupplierCategory.FUEL_SUPPLY },
    { name: 'Shell Cameroun', taxId: 'CM-SHELL-001', category: SupplierCategory.FUEL_SUPPLY },
    { name: 'Tradex SA', taxId: 'CM-TRADEX-001', category: SupplierCategory.FUEL_SUPPLY },
    { name: 'Neptune Oil', taxId: 'CM-NEPTUNE-001', category: SupplierCategory.FUEL_SUPPLY },
    { name: 'Camwater', taxId: 'CM-CAMWATER-001', category: SupplierCategory.UTILITIES },
    { name: 'ENEO', taxId: 'CM-ENEO-001', category: SupplierCategory.UTILITIES },
    { name: 'AfriTech Solutions', taxId: 'CM-AFRITECH-001', category: SupplierCategory.EQUIPMENT },
    { name: 'Express Maintenance', taxId: 'CM-EXPRMAINT-001', category: SupplierCategory.MAINTENANCE },
    { name: 'Fournitures Pro', taxId: 'CM-FOURNPRO-001', category: SupplierCategory.OTHER },
  ];

  const suppliers: Array<{ id: string; name: string; category: SupplierCategory }> = [];
  for (const sup of supplierData) {
    const s = await prisma.supplier.create({
      data: {
        id: uuid(),
        name: sup.name,
        taxId: sup.taxId,
        email: `contact@${sup.name.toLowerCase().replace(/\s/g, '')}.cm`,
        phone: `+237 6${Math.floor(Math.random() * 90 + 10)} ${Math.floor(Math.random() * 900 + 100)} ${Math.floor(Math.random() * 900 + 100)}`,
        category: sup.category,
        address: `BP ${Math.floor(Math.random() * 9000 + 1000)}, Douala`,
        isActive: true,
      },
    });
    suppliers.push({ id: s.id, name: sup.name, category: sup.category });
  }

  // One inactive supplier
  await prisma.supplier.create({
    data: {
      id: uuid(),
      name: 'Ancien Fournisseur',
      taxId: 'CM-ANCIEN-001',
      email: 'ancien@supplier.cm',
      phone: '+237 699 000 000',
      category: SupplierCategory.OTHER,
      address: 'BP 0000, Douala',
      isActive: false,
      deletedAt: daysAgo(60),
    },
  });

  console.log('  ✓ 11 suppliers created (10 active, 1 inactive)');

  // ────────────── 5. Shifts (45 days × 2 shifts/day × 5 stations = 450 shifts) ──────────────
  const shiftTypes: ShiftType[] = [ShiftType.MORNING, ShiftType.EVENING];

  for (const station of stations) {
    for (let day = 45; day >= 0; day--) {
      for (const shiftType of shiftTypes) {
        const shiftDate = daysAgo(day);
        const pompiste = station.pompistes[Math.floor(Math.random() * station.pompistes.length)];

        const shiftId = uuid();

        // Create shift with varied realistic data
        const baseRevenue = randomBetween(300000, 700000);
        const totalRevenue = new Decimal(baseRevenue);

        // Create different variance scenarios for testing
        let cashVariance: Decimal;
        let justification: string | null = null;

        if (day % 15 === 0) {
          // High variance case
          cashVariance = new Decimal(randomBetween(-8000, -5000));
          justification = 'Erreur de rendu monnaie détectée et documentée';
        } else if (day % 7 === 0) {
          // Medium variance
          cashVariance = new Decimal(randomBetween(2000, 4000));
          justification = 'Surplus de caisse vérifié';
        } else {
          // Normal variance
          cashVariance = new Decimal(randomBetween(-1500, 1500));
          justification = cashVariance.abs().greaterThan(1000) ? 'Écart dans les limites acceptables' : null;
        }

        const stockVariance = new Decimal(randomBetween(-100, 100));
        const cashCounted = new Decimal(randomBetween(baseRevenue * 0.7, baseRevenue * 0.8));
        const cardAmount = new Decimal(randomBetween(baseRevenue * 0.15, baseRevenue * 0.25));
        const expensesAmount = new Decimal(randomBetween(5000, 25000));
        const theoreticalCash = cashCounted.plus(cashVariance);

        // Price snapshot
        const priceSnapshot = {
          ESSENCE: 730,
          GASOIL: 720,
        };

        // Determine status based on day
        let status: 'OPEN' | 'CLOSED' | 'LOCKED';
        if (day === 0 && shiftType === ShiftType.MORNING) {
          status = 'OPEN'; // Today's morning shift still open
        } else if (day <= 1) {
          status = 'CLOSED';
        } else {
          status = 'LOCKED';
        }

        await prisma.shiftReport.create({
          data: {
            id: shiftId,
            stationId: station.id,
            shiftDate,
            shiftType,
            status,
            totalRevenue,
            cashVariance,
            stockVariance,
            cashCounted,
            cardAmount,
            expensesAmount,
            theoreticalCash,
            appliedPriceSnapshot: priceSnapshot,
            justification,
            openedById: pompiste,
            closedById: status !== 'OPEN' ? station.chefPisteId : null,
          },
        });

        // ShiftSales for each nozzle
        for (let ni = 0; ni < station.nozzles.length; ni++) {
          const nozzle = station.nozzles[ni];
          const openingIndex = new Decimal(randomBetween(10000 + day * 500, 100000 + day * 500));
          const volumeSold = new Decimal(randomBetween(50, 350));
          const closingIndex = openingIndex.plus(volumeSold);
          const price = prices[nozzle.fuelType];
          const revenue = volumeSold.times(price);

          await prisma.shiftSale.create({
            data: {
              id: uuid(),
              shiftReportId: shiftId,
              nozzleId: nozzle.id,
              openingIndex,
              closingIndex: status !== 'OPEN' ? closingIndex : null,
              volumeSold: status !== 'OPEN' ? volumeSold : null,
              unitPrice: new Decimal(price),
              revenue: status !== 'OPEN' ? revenue : null,
            },
          });
        }

        // ShiftTankDips for each tank
        for (const tank of station.tanks) {
          const openingLevel = new Decimal(randomBetween(10000, 25000));
          const consumption = randomBetween(200, 700);
          const closingLevel = openingLevel.minus(consumption);
          const deliveryReceived = day % 10 === 0 ? randomBetween(8000, 15000) : 0;

          await prisma.shiftTankDip.create({
            data: {
              id: uuid(),
              shiftReportId: shiftId,
              tankId: tank.id,
              openingLevel,
              closingLevel: status !== 'OPEN' ? closingLevel : null,
              deliveries: new Decimal(deliveryReceived),
              theoreticalStock: status !== 'OPEN' ? openingLevel.minus(consumption).plus(deliveryReceived) : null,
              stockVariance: status !== 'OPEN' ? new Decimal(randomBetween(-30, 30)) : null,
            },
          });
        }
      }
    }
  }
  console.log('  ✓ 450 shifts with sales and tank dips seeded');

  // ────────────── 6. Invoices (30 invoices in various statuses) ──────────────
  const invoiceStatuses: InvoiceStatus[] = [
    InvoiceStatus.DRAFT,
    InvoiceStatus.PENDING_APPROVAL,
    InvoiceStatus.APPROVED,
    InvoiceStatus.REJECTED,
    InvoiceStatus.PAID,
  ];

  const createdInvoices: Array<{ id: string; status: InvoiceStatus }> = [];

  for (let i = 0; i < 30; i++) {
    const supplier = suppliers[i % suppliers.length];
    const baseAmount = supplier.category === SupplierCategory.FUEL_SUPPLY
      ? randomBetween(5000000, 25000000)
      : randomBetween(50000, 2000000);
    const amount = new Decimal(baseAmount);
    const status = invoiceStatuses[i % invoiceStatuses.length];
    const invoiceId = uuid();

    await prisma.invoice.create({
      data: {
        id: invoiceId,
        supplierId: supplier.id,
        invoiceNumber: `INV-2026-${String(i + 1).padStart(4, '0')}`,
        amount,
        currency: 'XAF',
        status,
        dueDate: daysAgo(-30 + i * 2),
        fileUrl: `/uploads/invoices/inv-${i + 1}.pdf`,
        submittedById: financeDir.id,
        approvedById: [InvoiceStatus.APPROVED, InvoiceStatus.PAID].includes(status) ? cfo.id : null,
        rejectionReason: status === InvoiceStatus.REJECTED ? pickRandom([
          'Montant incorrect',
          'Document illisible',
          'Informations manquantes',
          'Facture en double',
        ]) : null,
        createdAt: daysAgo(30 - i),
      },
    });

    createdInvoices.push({ id: invoiceId, status });
  }
  console.log('  ✓ 30 invoices seeded');

  // ────────────── 7. Expenses (25 expense requests in various statuses) ──────────────
  const expenseCategories: ExpenseCategory[] = [
    ExpenseCategory.MAINTENANCE,
    ExpenseCategory.UTILITIES,
    ExpenseCategory.SUPPLIES,
    ExpenseCategory.TRANSPORT,
    ExpenseCategory.PERSONNEL,
    ExpenseCategory.MISCELLANEOUS,
  ];

  const expenseStatuses: ExpenseStatus[] = [
    ExpenseStatus.SUBMITTED,
    ExpenseStatus.PENDING_MANAGER,
    ExpenseStatus.PENDING_FINANCE,
    ExpenseStatus.APPROVED,
    ExpenseStatus.REJECTED,
    ExpenseStatus.DISBURSED,
  ];

  const expenseTitles: Record<ExpenseCategory, string[]> = {
    [ExpenseCategory.MAINTENANCE]: ['Réparation pompe P1', 'Entretien groupe électrogène', 'Remplacement joints', 'Peinture piste'],
    [ExpenseCategory.UTILITIES]: ['Facture électricité', 'Facture eau', 'Internet et téléphone', 'Abonnement sécurité'],
    [ExpenseCategory.SUPPLIES]: ['Fournitures de bureau', 'Produits d\'entretien', 'EPI pompistes', 'Papeterie'],
    [ExpenseCategory.TRANSPORT]: ['Carburant véhicule service', 'Location véhicule', 'Frais de taxi', 'Transport marchandises'],
    [ExpenseCategory.PERSONNEL]: ['Prime pompiste', 'Formation sécurité', 'Uniforme personnel', 'Frais médicaux'],
    [ExpenseCategory.MISCELLANEOUS]: ['Frais divers', 'Déplacement professionnel', 'Réception clients', 'Abonnement logiciel'],
  };

  const createdExpenses: Array<{ id: string; status: ExpenseStatus }> = [];

  for (let i = 0; i < 25; i++) {
    const station = stations[i % stations.length];
    const category = expenseCategories[i % expenseCategories.length];
    const titles = expenseTitles[category];
    const title = titles[i % titles.length];

    // Vary amounts by category
    const amountRanges: Record<ExpenseCategory, [number, number]> = {
      [ExpenseCategory.MAINTENANCE]: [50000, 500000],
      [ExpenseCategory.UTILITIES]: [20000, 200000],
      [ExpenseCategory.SUPPLIES]: [10000, 100000],
      [ExpenseCategory.TRANSPORT]: [5000, 50000],
      [ExpenseCategory.PERSONNEL]: [25000, 250000],
      [ExpenseCategory.MISCELLANEOUS]: [5000, 75000],
    };
    const [minAmt, maxAmt] = amountRanges[category];
    const amount = new Decimal(randomBetween(minAmt, maxAmt));
    const status = expenseStatuses[i % expenseStatuses.length];
    const expenseId = uuid();

    await prisma.expense.create({
      data: {
        id: expenseId,
        requesterId: station.managerId,
        stationId: station.id,
        title: `${title} - ${station.name}`,
        amount,
        category,
        status,
        rejectionReason: status === ExpenseStatus.REJECTED ? pickRandom([
          'Budget dépassé',
          'Justificatif manquant',
          'Dépense non autorisée',
          'Montant excessif',
        ]) : null,
        disbursementMethod: status === ExpenseStatus.DISBURSED
          ? (amount.greaterThan(100000) ? DisbursementMethod.BANK_TRANSFER : DisbursementMethod.PETTY_CASH)
          : null,
        disbursedAt: status === ExpenseStatus.DISBURSED ? daysAgo(Math.floor(Math.random() * 10)) : null,
        createdAt: daysAgo(25 - i),
      },
    });

    createdExpenses.push({ id: expenseId, status });
  }
  console.log('  ✓ 25 expense requests seeded');

  // ────────────── 8. Approval Steps ──────────────
  // Create approval steps for approved/rejected invoices and expenses
  for (const invoice of createdInvoices) {
    if ([InvoiceStatus.APPROVED, InvoiceStatus.PAID, InvoiceStatus.REJECTED].includes(invoice.status)) {
      await prisma.approvalStep.create({
        data: {
          id: uuid(),
          entityType: ApprovalEntityType.INVOICE,
          invoiceId: invoice.id,
          role: 'CFO',
          userId: cfo.id,
          action: invoice.status === InvoiceStatus.REJECTED ? ApprovalAction.REJECT : ApprovalAction.APPROVE,
          comment: invoice.status === InvoiceStatus.REJECTED
            ? 'Document incomplet'
            : 'Validé après vérification',
          actedAt: daysAgo(Math.floor(Math.random() * 15)),
        },
      });
    }
  }

  for (const expense of createdExpenses) {
    if ([ExpenseStatus.APPROVED, ExpenseStatus.DISBURSED, ExpenseStatus.REJECTED].includes(expense.status)) {
      // Manager approval
      await prisma.approvalStep.create({
        data: {
          id: uuid(),
          entityType: ApprovalEntityType.EXPENSE,
          expenseId: expense.id,
          role: 'STATION_MANAGER',
          userId: stations[0].managerId,
          action: ApprovalAction.APPROVE,
          comment: 'Approuvé par le responsable station',
          actedAt: daysAgo(Math.floor(Math.random() * 20) + 5),
        },
      });

      // Finance approval for final statuses
      await prisma.approvalStep.create({
        data: {
          id: uuid(),
          entityType: ApprovalEntityType.EXPENSE,
          expenseId: expense.id,
          role: 'FINANCE_DIR',
          userId: financeDir.id,
          action: expense.status === ExpenseStatus.REJECTED ? ApprovalAction.REJECT : ApprovalAction.APPROVE,
          comment: expense.status === ExpenseStatus.REJECTED
            ? 'Budget insuffisant'
            : 'Validé pour décaissement',
          actedAt: daysAgo(Math.floor(Math.random() * 10)),
        },
      });
    }
  }
  console.log('  ✓ Approval steps created');

  // ────────────── 9. Checklist Templates ──────────────
  const template1 = await prisma.checklistTemplate.create({
    data: {
      id: uuid(),
      name: 'Inspection Quotidienne Station',
      version: 1,
      categories: {
        categories: [
          {
            name: 'Sécurité',
            items: [
              { id: '1', label: 'Extincteurs vérifiés', required: true },
              { id: '2', label: 'Issues de secours dégagées', required: true },
              { id: '3', label: 'Éclairage de sécurité fonctionnel', required: true },
              { id: '4', label: 'Signalisation visible', required: true },
            ],
          },
          {
            name: 'Équipements',
            items: [
              { id: '5', label: 'Pompes fonctionnelles', required: true },
              { id: '6', label: 'Affichage prix à jour', required: true },
              { id: '7', label: 'Compteurs calibrés', required: false },
              { id: '8', label: 'Pistolets en bon état', required: true },
            ],
          },
          {
            name: 'Propreté',
            items: [
              { id: '9', label: 'Piste propre', required: true },
              { id: '10', label: 'Toilettes propres', required: false },
              { id: '11', label: 'Boutique rangée', required: false },
            ],
          },
          {
            name: 'Stockage',
            items: [
              { id: '12', label: 'Niveaux cuves vérifiés', required: true },
              { id: '13', label: 'Pas de fuite détectée', required: true },
              { id: '14', label: 'Vannes fermées et scellées', required: true },
            ],
          },
        ],
      },
      isActive: true,
    },
  });

  // Older template version (inactive)
  await prisma.checklistTemplate.create({
    data: {
      id: uuid(),
      name: 'Inspection Quotidienne Station',
      version: 0,
      categories: {
        categories: [
          {
            name: 'Sécurité',
            items: [
              { id: '1', label: 'Extincteurs vérifiés', required: true },
              { id: '2', label: 'Issues de secours dégagées', required: true },
            ],
          },
        ],
      },
      isActive: false,
    },
  });

  // ────────────── 10. Checklist Submissions (20 with varied scores) ──────────────
  for (let i = 0; i < 20; i++) {
    const station = stations[i % stations.length];
    const shiftDate = daysAgo(i + 1);
    const shiftType = i % 2 === 0 ? ShiftType.MORNING : ShiftType.EVENING;

    // Vary scores more realistically
    let score: number;
    if (i % 10 === 0) {
      score = Math.floor(randomBetween(60, 75)); // Some poor scores
    } else if (i % 5 === 0) {
      score = Math.floor(randomBetween(75, 85)); // Medium scores
    } else {
      score = Math.floor(randomBetween(85, 100)); // Good scores
    }

    const nonConformeCount = Math.floor((100 - score) / 7);
    const responses = [];
    for (let itemId = 1; itemId <= 14; itemId++) {
      responses.push({
        itemId: String(itemId),
        status: itemId <= nonConformeCount ? 'NON_CONFORME' : 'CONFORME',
        comment: itemId <= nonConformeCount ? 'À corriger rapidement' : null,
      });
    }

    await prisma.checklistSubmission.create({
      data: {
        id: uuid(),
        stationId: station.id,
        templateId: template1.id,
        templateVersion: 1,
        shiftDate,
        shiftType,
        submittedById: station.chefPisteId,
        validatedById: i > 5 ? station.managerId : null,
        items: { responses },
        computedScore: score,
        status: i > 5 ? 'VALIDATED' : i > 2 ? 'PENDING_VALIDATION' : 'DRAFT',
        createdAt: shiftDate,
      },
    });
  }
  console.log('  ✓ Checklist templates and 20 submissions seeded');

  // ────────────── 11. Incidents (15 incidents with varied states) ──────────────
  const incidentCategories = ['SAFETY', 'EQUIPMENT', 'SPILL', 'CUSTOMER_COMPLAINT', 'THEFT', 'FIRE', 'OTHER'];
  const incidentDescriptions: Record<string, string[]> = {
    SAFETY: ['Glissade sur la piste humide', 'Absence de signalisation', 'Extincteur périmé détecté'],
    EQUIPMENT: ['Pompe P2 hors service', 'Afficheur défaillant', 'Fuite au niveau du pistolet'],
    SPILL: ['Déversement de carburant mineur', 'Fuite détectée près de la cuve', 'Renversement lors du remplissage'],
    CUSTOMER_COMPLAINT: ['Réclamation sur le prix affiché', 'Plainte sur l\'attente', 'Contestation du volume livré'],
    THEFT: ['Vol à l\'étalage boutique', 'Tentative de fraude', 'Disparition de stock'],
    FIRE: ['Début d\'incendie maîtrisé', 'Alerte incendie déclenchée', 'Court-circuit détecté'],
    OTHER: ['Panne de courant', 'Vandalisme sur signalétique', 'Problème informatique'],
  };

  for (let i = 0; i < 15; i++) {
    const station = stations[i % stations.length];
    const category = incidentCategories[i % incidentCategories.length];
    const descriptions = incidentDescriptions[category];
    const description = descriptions[i % descriptions.length];

    // Vary statuses
    let status: IncidentStatus;
    let resolvedAt: Date | null = null;
    let resolutionNote: string | null = null;

    if (i < 3) {
      status = IncidentStatus.OPEN;
    } else if (i < 7) {
      status = IncidentStatus.IN_PROGRESS;
    } else if (i < 12) {
      status = IncidentStatus.RESOLVED;
      resolvedAt = daysAgo(Math.floor(Math.random() * 5) + 1);
      resolutionNote = pickRandom([
        'Problème résolu avec succès',
        'Réparation effectuée par le technicien',
        'Situation normalisée après intervention',
        'Formation dispensée pour éviter récurrence',
      ]);
    } else {
      status = IncidentStatus.CLOSED;
      resolvedAt = daysAgo(Math.floor(Math.random() * 10) + 5);
      resolutionNote = 'Incident clôturé après vérification';
    }

    await prisma.incident.create({
      data: {
        id: uuid(),
        stationId: station.id,
        category,
        description: `${description} à ${station.name}`,
        photoUrl: i % 3 === 0 ? `/uploads/incidents/incident-${i + 1}.jpg` : null,
        status,
        assignedToId: status !== IncidentStatus.OPEN ? station.managerId : null,
        resolvedAt,
        resolutionNote,
        reportedById: station.chefPisteId,
        createdAt: daysAgo(15 - i),
      },
    });
  }
  console.log('  ✓ 15 incidents seeded');

  // ────────────── 12. Replenishment Requests ──────────────
  const replenishmentStatuses: ReplenishmentStatus[] = [
    ReplenishmentStatus.DRAFT,
    ReplenishmentStatus.PENDING_VALIDATION,
    ReplenishmentStatus.VALIDATED,
    ReplenishmentStatus.ORDERED,
    ReplenishmentStatus.COMPLETED,
  ];

  for (let i = 0; i < 10; i++) {
    const station = stations[i % stations.length];
    const fuelType = i % 2 === 0 ? FuelType.ESSENCE : FuelType.GASOIL;
    const status = replenishmentStatuses[i % replenishmentStatuses.length];

    await prisma.replenishmentRequest.create({
      data: {
        id: uuid(),
        stationId: station.id,
        fuelType,
        requestedVolume: new Decimal(randomBetween(10000, 25000)),
        status,
        requestedById: station.managerId,
        createdAt: daysAgo(10 - i),
      },
    });
  }
  console.log('  ✓ 10 replenishment requests seeded');

  // ────────────── 13. Fuel Deliveries (10 deliveries) ──────────────
  const deliveryStatuses = ['IN_PROGRESS', 'VALIDATED', 'DISPUTED'] as const;

  for (let i = 0; i < 10; i++) {
    const station = stations[i % stations.length];
    const deliveryId = uuid();
    const status = deliveryStatuses[i % deliveryStatuses.length];

    const blTotalVolume = new Decimal(randomBetween(15000, 30000));
    const globalVariance = status !== 'IN_PROGRESS'
      ? new Decimal(randomBetween(-100, 100))
      : null;

    await prisma.fuelDelivery.create({
      data: {
        id: deliveryId,
        stationId: station.id,
        blNumber: `BL-2026-${String(i + 1).padStart(4, '0')}`,
        blTotalVolume,
        truckPlate: `LT-${1000 + i}-CM`,
        driverName: pickRandom(['Jean Ndongo', 'Pierre Ateba', 'Paul Mbida', 'Marie Fouda', 'Eric Ngono']),
        status,
        globalVariance,
        startedAt: daysAgo(10 - i),
        completedAt: status !== 'IN_PROGRESS' ? daysAgo(9 - i) : null,
        createdAt: daysAgo(10 - i),
      },
    });

    // Delivery compartments
    for (const tank of station.tanks) {
      const blVolume = new Decimal(randomBetween(5000, 15000));
      const openingDip = new Decimal(randomBetween(8000, 15000));
      const physicalReceived = blVolume.plus(randomBetween(-50, 50));
      const closingDip = openingDip.plus(physicalReceived);
      const variance = physicalReceived.minus(blVolume);

      await prisma.deliveryCompartment.create({
        data: {
          id: uuid(),
          deliveryId,
          tankId: tank.id,
          fuelType: tank.fuelType,
          blVolume,
          openingDip: status !== 'IN_PROGRESS' ? openingDip : null,
          closingDip: status !== 'IN_PROGRESS' ? closingDip : null,
          physicalReceived: status !== 'IN_PROGRESS' ? physicalReceived : null,
          variance: status !== 'IN_PROGRESS' ? variance : null,
          status: status === 'IN_PROGRESS' ? null :
            (variance.abs().lessThan(30) ? 'VALIDATED' : 'DISPUTED'),
        },
      });
    }
  }
  console.log('  ✓ 10 fuel deliveries seeded');

  // ────────────── 14. Incoming Mail (20 mails) ──────────────
  const mailPriorities: MailPriority[] = [MailPriority.NORMAL, MailPriority.URGENT];
  const departments = ['Direction', 'Finance', 'Operations', 'RH', 'Logistique', 'Commercial', 'Technique'];
  const mailSubjects = [
    'Demande de partenariat',
    'Réclamation client',
    'Facture fournisseur',
    'Convocation inspection',
    'Rapport mensuel',
    'Demande de devis',
    'Notification réglementaire',
    'Invitation événement',
    'Demande d\'information',
    'Contrat à renouveler',
  ];

  for (let i = 0; i < 20; i++) {
    const station = stations[i % stations.length];
    const priority = i % 5 === 0 ? MailPriority.URGENT : mailPriorities[i % 2];
    const department = departments[i % departments.length];
    const subject = mailSubjects[i % mailSubjects.length];

    // Vary SLA states
    let slaState: 'ON_TIME' | 'DUE_SOON' | 'OVERDUE';
    let status: MailStatus;
    let deadline: Date;

    if (i < 5) {
      slaState = 'ON_TIME';
      status = MailStatus.RECEIVED;
      deadline = daysAgo(-14 + i); // Future deadline
    } else if (i < 10) {
      slaState = 'ON_TIME';
      status = MailStatus.IN_PROGRESS;
      deadline = daysAgo(-7 + i);
    } else if (i < 15) {
      slaState = 'DUE_SOON';
      status = MailStatus.IN_PROGRESS;
      deadline = daysAgo(-2 + (i % 3));
    } else {
      slaState = i % 2 === 0 ? 'OVERDUE' : 'DUE_SOON';
      status = i % 3 === 0 ? MailStatus.RESPONDED : MailStatus.ARCHIVED;
      deadline = daysAgo(i - 15);
    }

    await prisma.incomingMail.create({
      data: {
        id: uuid(),
        sender: `expediteur${i + 1}@${pickRandom(['external', 'partner', 'supplier', 'government'])}.cm`,
        subject: `${subject} - Ref ${String(i + 1).padStart(4, '0')}`,
        receivedAt: daysAgo(20 - i),
        priority,
        recipientDepartment: department,
        deadline,
        assignedToId: status !== MailStatus.RECEIVED ? station.managerId : null,
        status,
        slaState,
        attachmentUrl: i % 3 === 0 ? `/uploads/mails/mail-${i + 1}.pdf` : null,
        createdAt: daysAgo(20 - i),
      },
    });
  }
  console.log('  ✓ 20 incoming mails seeded');

  // ────────────── 15. Notifications (varied types) ──────────────
  const notificationTypes = [
    { type: 'INVOICE_PENDING', title: 'Facture en attente', icon: '📄' },
    { type: 'EXPENSE_PENDING', title: 'Dépense à valider', icon: '💰' },
    { type: 'LOW_TANK', title: 'Niveau cuve bas', icon: '⚠️' },
    { type: 'CRITICAL_TANK', title: 'Niveau cuve critique', icon: '🚨' },
    { type: 'INVOICE_APPROVED', title: 'Facture approuvée', icon: '✅' },
    { type: 'INVOICE_REJECTED', title: 'Facture rejetée', icon: '❌' },
    { type: 'EXPENSE_APPROVED', title: 'Dépense approuvée', icon: '✅' },
    { type: 'EXPENSE_REJECTED', title: 'Dépense rejetée', icon: '❌' },
    { type: 'SHIFT_VARIANCE', title: 'Écart de caisse', icon: '📊' },
    { type: 'INCIDENT_REPORTED', title: 'Incident signalé', icon: '🔔' },
    { type: 'PRICE_CHANGE', title: 'Changement de prix', icon: '💹' },
    { type: 'DELIVERY_RECEIVED', title: 'Livraison reçue', icon: '🚛' },
    { type: 'MAIL_DEADLINE', title: 'Échéance courrier', icon: '📬' },
    { type: 'CHECKLIST_DUE', title: 'Checklist à compléter', icon: '📋' },
  ];

  const allUsers = [ceo, cfo, financeDir, logistics, dco, ...stations.map(s => ({ id: s.managerId }))];

  for (let i = 0; i < 50; i++) {
    const notifType = notificationTypes[i % notificationTypes.length];
    const user = allUsers[i % allUsers.length];
    const station = stations[i % stations.length];

    const messages: Record<string, string[]> = {
      INVOICE_PENDING: [`Facture de ${randomBetween(1, 15).toFixed(0)} M FCFA en attente d'approbation`],
      EXPENSE_PENDING: [`Demande de dépense de ${randomBetween(50, 500).toFixed(0)} K FCFA à valider`],
      LOW_TANK: [`${station.name} - Cuve ${pickRandom(['ESSENCE', 'GASOIL'])} à ${randomBetween(20, 30).toFixed(0)}%`],
      CRITICAL_TANK: [`URGENT: ${station.name} - Cuve ${pickRandom(['ESSENCE', 'GASOIL'])} à ${randomBetween(10, 18).toFixed(0)}%`],
      INVOICE_APPROVED: [`La facture INV-2026-${String(i % 30 + 1).padStart(4, '0')} a été approuvée`],
      INVOICE_REJECTED: [`La facture INV-2026-${String(i % 30 + 1).padStart(4, '0')} a été rejetée`],
      EXPENSE_APPROVED: [`Votre demande de dépense a été approuvée`],
      EXPENSE_REJECTED: [`Votre demande de dépense a été rejetée`],
      SHIFT_VARIANCE: [`Écart de ${randomBetween(-5000, 5000).toFixed(0)} FCFA sur le poste ${pickRandom(['matin', 'soir'])}`],
      INCIDENT_REPORTED: [`Nouvel incident ${pickRandom(['SAFETY', 'EQUIPMENT', 'SPILL'])} à ${station.name}`],
      PRICE_CHANGE: [`Nouveau prix ${pickRandom(['ESSENCE', 'GASOIL'])} en attente de validation`],
      DELIVERY_RECEIVED: [`Livraison BL-2026-${String(i % 10 + 1).padStart(4, '0')} reçue à ${station.name}`],
      MAIL_DEADLINE: [`Courrier en attente de traitement - échéance proche`],
      CHECKLIST_DUE: [`Checklist ${pickRandom(['matin', 'soir'])} à compléter pour ${station.name}`],
    };

    await prisma.notification.create({
      data: {
        id: uuid(),
        userId: user.id,
        type: notifType.type,
        title: notifType.title,
        message: messages[notifType.type][0],
        link: `/admin/${notifType.type.includes('INVOICE') ? 'finance/invoices' :
          notifType.type.includes('EXPENSE') ? 'finance/expenses' :
            notifType.type.includes('TANK') ? 'supply' :
              notifType.type.includes('SHIFT') ? 'shifts' :
                notifType.type.includes('INCIDENT') ? 'incidents' :
                  notifType.type.includes('PRICE') ? 'prices' :
                    notifType.type.includes('DELIVERY') ? 'supply/deliveries' :
                      notifType.type.includes('MAIL') ? 'mails' : 'dashboard'}`,
        isRead: i > 30,
        readAt: i > 30 ? daysAgo(Math.floor(Math.random() * 5)) : null,
        createdAt: hoursAgo(i * 2),
      },
    });
  }
  console.log('  ✓ 50 notifications created');

  // ────────────── 16. Audit Logs ──────────────
  const auditActions = [
    { action: 'CREATE', entityType: 'Invoice' },
    { action: 'UPDATE', entityType: 'Invoice' },
    { action: 'APPROVE', entityType: 'Invoice' },
    { action: 'CREATE', entityType: 'Expense' },
    { action: 'APPROVE', entityType: 'Expense' },
    { action: 'REJECT', entityType: 'Expense' },
    { action: 'CREATE', entityType: 'ShiftReport' },
    { action: 'CLOSE', entityType: 'ShiftReport' },
    { action: 'CREATE', entityType: 'Incident' },
    { action: 'RESOLVE', entityType: 'Incident' },
    { action: 'CREATE', entityType: 'FuelDelivery' },
    { action: 'VALIDATE', entityType: 'FuelDelivery' },
    { action: 'CREATE', entityType: 'FuelPrice' },
    { action: 'APPROVE', entityType: 'FuelPrice' },
    { action: 'LOGIN', entityType: 'User' },
  ];

  for (let i = 0; i < 100; i++) {
    const auditAction = auditActions[i % auditActions.length];
    const user = allUsers[i % allUsers.length];

    await prisma.auditLog.create({
      data: {
        id: uuid(),
        timestamp: hoursAgo(i),
        userId: user.id,
        action: auditAction.action,
        entityType: auditAction.entityType,
        entityId: uuid(),
        changes: auditAction.action === 'UPDATE' ? {
          before: { status: 'DRAFT' },
          after: { status: 'PENDING_APPROVAL' },
        } : null,
        ipAddress: `192.168.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`,
      },
    });
  }
  console.log('  ✓ 100 audit logs created');

  // ────────────── 17. File Uploads ──────────────
  const fileTypes = [
    { ext: 'pdf', mime: 'application/pdf', type: 'invoice' },
    { ext: 'pdf', mime: 'application/pdf', type: 'expense' },
    { ext: 'jpg', mime: 'image/jpeg', type: 'incident' },
    { ext: 'png', mime: 'image/png', type: 'checklist' },
    { ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', type: 'report' },
  ];

  for (let i = 0; i < 20; i++) {
    const fileType = fileTypes[i % fileTypes.length];
    const fileId = uuid();

    await prisma.fileUpload.create({
      data: {
        id: fileId,
        originalName: `${fileType.type}-${i + 1}.${fileType.ext}`,
        mimeType: fileType.mime,
        size: Math.floor(randomBetween(10000, 5000000)),
        path: `/uploads/${fileType.type}s/${fileId}.${fileType.ext}`,
        url: `/api/files/${fileId}`,
        uploadedById: allUsers[i % allUsers.length].id,
        createdAt: daysAgo(Math.floor(Math.random() * 30)),
      },
    });
  }
  console.log('  ✓ 20 file uploads created');

  // Mark unused imports as used
  void superAdmin;
  void dco;

  console.log('\n✅ Seed completed successfully!');
  console.log('═══════════════════════════════════════════════════');
  console.log('📊 Summary:');
  console.log('   • Users: 30+ (all roles)');
  console.log('   • Stations: 5 (4 active, 1 inactive)');
  console.log('   • Suppliers: 11 (10 active, 1 inactive)');
  console.log('   • Shifts: 450 (45 days × 2 × 5 stations)');
  console.log('   • Invoices: 30 (all statuses)');
  console.log('   • Expenses: 25 (all statuses)');
  console.log('   • Approval Steps: ~50');
  console.log('   • Checklists: 20 submissions');
  console.log('   • Incidents: 15 (all statuses)');
  console.log('   • Deliveries: 10');
  console.log('   • Replenishments: 10');
  console.log('   • Mails: 20 (all SLA states)');
  console.log('   • Notifications: 50');
  console.log('   • Audit Logs: 100');
  console.log('   • File Uploads: 20');
  console.log('═══════════════════════════════════════════════════');
  console.log('🔐 All passwords: Alcom2026!');
  console.log('');
  console.log('👤 Test accounts:');
  console.log('   admin@alcom.cm      (SUPER_ADMIN)');
  console.log('   ceo@alcom.cm        (CEO)');
  console.log('   cfo@alcom.cm        (CFO)');
  console.log('   finance@alcom.cm    (FINANCE_DIR)');
  console.log('   logistics@alcom.cm  (LOGISTICS)');
  console.log('   dco@alcom.cm        (DCO)');
  console.log('   manager1-5@alcom.cm (STATION_MANAGER)');
  console.log('   chefpiste1-5@alcom.cm (CHEF_PISTE)');
  console.log('   pompiste1-15@alcom.cm (POMPISTE)');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
