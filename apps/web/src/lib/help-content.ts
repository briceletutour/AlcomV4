import {
  Fuel,
  CalendarClock,
  DollarSign,
  Receipt,
  Package,
  ClipboardCheck,
  AlertTriangle,
  Mail,
  Truck,
  type LucideIcon,
} from 'lucide-react';

export interface HelpStep {
  stepNumber: number;
  titleKey: string;
  descriptionKey: string;
  roles?: string[];
}

export interface Calculation {
  nameKey: string;
  formulaKey: string;
  variables?: Record<string, string>;
  exampleKey?: string;
}

export interface RouteInfo {
  path: string;
  descriptionKey: string;
}

export interface HelpSection {
  id: string;
  moduleKey: string;
  icon: LucideIcon;
  steps: HelpStep[];
  calculations?: Calculation[];
  routes: RouteInfo[];
  keywords: string[];
}

export const helpSections: HelpSection[] = [
  {
    id: 'stations',
    moduleKey: 'stations',
    icon: Fuel,
    keywords: ['station', 'infrastructure', 'tank', 'pump', 'nozzle', 'equipment'],
    steps: [
      {
        stepNumber: 1,
        titleKey: 'Help.modules.stations.step1Title',
        descriptionKey: 'Help.modules.stations.step1Desc',
        roles: ['SUPER_ADMIN', 'DCO'],
      },
      {
        stepNumber: 2,
        titleKey: 'Help.modules.stations.step2Title',
        descriptionKey: 'Help.modules.stations.step2Desc',
      },
      {
        stepNumber: 3,
        titleKey: 'Help.modules.stations.step3Title',
        descriptionKey: 'Help.modules.stations.step3Desc',
        roles: ['STATION_MANAGER'],
      },
      {
        stepNumber: 4,
        titleKey: 'Help.modules.stations.step4Title',
        descriptionKey: 'Help.modules.stations.step4Desc',
      },
    ],
    routes: [
      { path: '/admin/stations', descriptionKey: 'Help.routes.stations.list' },
      { path: '/admin/stations/new', descriptionKey: 'Help.routes.stations.new' },
      { path: '/admin/stations/[id]', descriptionKey: 'Help.routes.stations.details' },
    ],
  },
  {
    id: 'shifts',
    moduleKey: 'shifts',
    icon: CalendarClock,
    keywords: ['shift', 'sales', 'variance', 'cash', 'stock', 'dip', 'nozzle', 'meter'],
    steps: [
      {
        stepNumber: 1,
        titleKey: 'Help.modules.shifts.step1Title',
        descriptionKey: 'Help.modules.shifts.step1Desc',
        roles: ['CHEF_PISTE', 'STATION_MANAGER'],
      },
      {
        stepNumber: 2,
        titleKey: 'Help.modules.shifts.step2Title',
        descriptionKey: 'Help.modules.shifts.step2Desc',
        roles: ['POMPISTE', 'CHEF_PISTE'],
      },
      {
        stepNumber: 3,
        titleKey: 'Help.modules.shifts.step3Title',
        descriptionKey: 'Help.modules.shifts.step3Desc',
      },
      {
        stepNumber: 4,
        titleKey: 'Help.modules.shifts.step4Title',
        descriptionKey: 'Help.modules.shifts.step4Desc',
        roles: ['STATION_MANAGER', 'FINANCE_DIR'],
      },
    ],
    calculations: [
      {
        nameKey: 'Help.calculations.volumeSold',
        formulaKey: 'Help.calculations.volumeSoldFormula',
        exampleKey: 'Help.calculations.volumeSoldExample',
      },
      {
        nameKey: 'Help.calculations.revenue',
        formulaKey: 'Help.calculations.revenueFormula',
        exampleKey: 'Help.calculations.revenueExample',
      },
      {
        nameKey: 'Help.calculations.cashVariance',
        formulaKey: 'Help.calculations.cashVarianceFormula',
        exampleKey: 'Help.calculations.cashVarianceExample',
      },
      {
        nameKey: 'Help.calculations.stockVariance',
        formulaKey: 'Help.calculations.stockVarianceFormula',
        exampleKey: 'Help.calculations.stockVarianceExample',
      },
    ],
    routes: [
      { path: '/admin/shifts', descriptionKey: 'Help.routes.shifts.list' },
      { path: '/admin/shifts/open', descriptionKey: 'Help.routes.shifts.open' },
      { path: '/admin/shifts/[id]', descriptionKey: 'Help.routes.shifts.details' },
      { path: '/admin/shifts/[id]/close', descriptionKey: 'Help.routes.shifts.close' },
    ],
  },
  {
    id: 'prices',
    moduleKey: 'prices',
    icon: DollarSign,
    keywords: ['price', 'fuel', 'approval', 'snapshot', 'effective', 'pricing'],
    steps: [
      {
        stepNumber: 1,
        titleKey: 'Help.modules.prices.step1Title',
        descriptionKey: 'Help.modules.prices.step1Desc',
        roles: ['FINANCE_DIR', 'DCO'],
      },
      {
        stepNumber: 2,
        titleKey: 'Help.modules.prices.step2Title',
        descriptionKey: 'Help.modules.prices.step2Desc',
        roles: ['CFO', 'CEO'],
      },
      {
        stepNumber: 3,
        titleKey: 'Help.modules.prices.step3Title',
        descriptionKey: 'Help.modules.prices.step3Desc',
      },
      {
        stepNumber: 4,
        titleKey: 'Help.modules.prices.step4Title',
        descriptionKey: 'Help.modules.prices.step4Desc',
      },
    ],
    routes: [
      { path: '/admin/prices', descriptionKey: 'Help.routes.prices.list' },
      { path: '/admin/prices/new', descriptionKey: 'Help.routes.prices.new' },
      { path: '/admin/prices/history', descriptionKey: 'Help.routes.prices.history' },
    ],
  },
  {
    id: 'expenses',
    moduleKey: 'expenses',
    icon: DollarSign,
    keywords: ['expense', 'disbursement', 'approval', 'petty cash', 'payment'],
    steps: [
      {
        stepNumber: 1,
        titleKey: 'Help.modules.expenses.step1Title',
        descriptionKey: 'Help.modules.expenses.step1Desc',
        roles: ['STATION_MANAGER'],
      },
      {
        stepNumber: 2,
        titleKey: 'Help.modules.expenses.step2Title',
        descriptionKey: 'Help.modules.expenses.step2Desc',
        roles: ['STATION_MANAGER'],
      },
      {
        stepNumber: 3,
        titleKey: 'Help.modules.expenses.step3Title',
        descriptionKey: 'Help.modules.expenses.step3Desc',
        roles: ['FINANCE_DIR', 'CFO'],
      },
      {
        stepNumber: 4,
        titleKey: 'Help.modules.expenses.step4Title',
        descriptionKey: 'Help.modules.expenses.step4Desc',
      },
    ],
    routes: [
      { path: '/admin/finance/expenses', descriptionKey: 'Help.routes.expenses.list' },
      { path: '/admin/finance/expenses/new', descriptionKey: 'Help.routes.expenses.new' },
      { path: '/admin/finance/expenses/[id]', descriptionKey: 'Help.routes.expenses.details' },
    ],
  },
  {
    id: 'invoices',
    moduleKey: 'invoices',
    icon: Receipt,
    keywords: ['invoice', 'supplier', 'vendor', 'payment', 'approval', 'bill'],
    steps: [
      {
        stepNumber: 1,
        titleKey: 'Help.modules.invoices.step1Title',
        descriptionKey: 'Help.modules.invoices.step1Desc',
      },
      {
        stepNumber: 2,
        titleKey: 'Help.modules.invoices.step2Title',
        descriptionKey: 'Help.modules.invoices.step2Desc',
      },
      {
        stepNumber: 3,
        titleKey: 'Help.modules.invoices.step3Title',
        descriptionKey: 'Help.modules.invoices.step3Desc',
        roles: ['STATION_MANAGER', 'FINANCE_DIR', 'CFO', 'CEO'],
      },
      {
        stepNumber: 4,
        titleKey: 'Help.modules.invoices.step4Title',
        descriptionKey: 'Help.modules.invoices.step4Desc',
        roles: ['FINANCE_DIR'],
      },
    ],
    routes: [
      { path: '/admin/finance/invoices', descriptionKey: 'Help.routes.invoices.list' },
      { path: '/admin/finance/invoices/new', descriptionKey: 'Help.routes.invoices.new' },
      { path: '/admin/finance/invoices/[id]', descriptionKey: 'Help.routes.invoices.details' },
      { path: '/admin/finance/suppliers', descriptionKey: 'Help.routes.suppliers.list' },
    ],
  },
  {
    id: 'supply',
    moduleKey: 'supply',
    icon: Truck,
    keywords: ['delivery', 'replenishment', 'fuel', 'truck', 'compartment', 'variance', 'bl'],
    steps: [
      {
        stepNumber: 1,
        titleKey: 'Help.modules.supply.step1Title',
        descriptionKey: 'Help.modules.supply.step1Desc',
        roles: ['STATION_MANAGER', 'DCO'],
      },
      {
        stepNumber: 2,
        titleKey: 'Help.modules.supply.step2Title',
        descriptionKey: 'Help.modules.supply.step2Desc',
        roles: ['LOGISTICS'],
      },
      {
        stepNumber: 3,
        titleKey: 'Help.modules.supply.step3Title',
        descriptionKey: 'Help.modules.supply.step3Desc',
        roles: ['CHEF_PISTE', 'STATION_MANAGER'],
      },
      {
        stepNumber: 4,
        titleKey: 'Help.modules.supply.step4Title',
        descriptionKey: 'Help.modules.supply.step4Desc',
      },
    ],
    routes: [
      { path: '/admin/supply/replenishment', descriptionKey: 'Help.routes.replenishment.list' },
      { path: '/admin/supply/replenishment/new', descriptionKey: 'Help.routes.replenishment.new' },
      { path: '/admin/supply/deliveries', descriptionKey: 'Help.routes.deliveries.list' },
      { path: '/admin/supply/deliveries/new', descriptionKey: 'Help.routes.deliveries.new' },
    ],
  },
  {
    id: 'checklists',
    moduleKey: 'checklists',
    icon: ClipboardCheck,
    keywords: ['checklist', 'quality', 'compliance', 'template', 'conforme', 'inspection'],
    steps: [
      {
        stepNumber: 1,
        titleKey: 'Help.modules.checklists.step1Title',
        descriptionKey: 'Help.modules.checklists.step1Desc',
        roles: ['SUPER_ADMIN', 'DCO'],
      },
      {
        stepNumber: 2,
        titleKey: 'Help.modules.checklists.step2Title',
        descriptionKey: 'Help.modules.checklists.step2Desc',
        roles: ['CHEF_PISTE'],
      },
      {
        stepNumber: 3,
        titleKey: 'Help.modules.checklists.step3Title',
        descriptionKey: 'Help.modules.checklists.step3Desc',
        roles: ['STATION_MANAGER'],
      },
      {
        stepNumber: 4,
        titleKey: 'Help.modules.checklists.step4Title',
        descriptionKey: 'Help.modules.checklists.step4Desc',
      },
    ],
    routes: [
      { path: '/admin/checklists', descriptionKey: 'Help.routes.checklists.list' },
      { path: '/admin/checklists/new', descriptionKey: 'Help.routes.checklists.new' },
      { path: '/admin/checklists/templates', descriptionKey: 'Help.routes.checklists.templates' },
    ],
  },
  {
    id: 'incidents',
    moduleKey: 'incidents',
    icon: AlertTriangle,
    keywords: ['incident', 'issue', 'problem', 'resolution', 'maintenance', 'report'],
    steps: [
      {
        stepNumber: 1,
        titleKey: 'Help.modules.incidents.step1Title',
        descriptionKey: 'Help.modules.incidents.step1Desc',
      },
      {
        stepNumber: 2,
        titleKey: 'Help.modules.incidents.step2Title',
        descriptionKey: 'Help.modules.incidents.step2Desc',
        roles: ['STATION_MANAGER', 'DCO'],
      },
      {
        stepNumber: 3,
        titleKey: 'Help.modules.incidents.step3Title',
        descriptionKey: 'Help.modules.incidents.step3Desc',
      },
      {
        stepNumber: 4,
        titleKey: 'Help.modules.incidents.step4Title',
        descriptionKey: 'Help.modules.incidents.step4Desc',
        roles: ['STATION_MANAGER'],
      },
    ],
    routes: [
      { path: '/admin/incidents', descriptionKey: 'Help.routes.incidents.list' },
      { path: '/admin/incidents/new', descriptionKey: 'Help.routes.incidents.new' },
      { path: '/admin/incidents/[id]', descriptionKey: 'Help.routes.incidents.details' },
    ],
  },
  {
    id: 'mails',
    moduleKey: 'mails',
    icon: Mail,
    keywords: ['mail', 'document', 'correspondence', 'sla', 'mailroom', 'archive'],
    steps: [
      {
        stepNumber: 1,
        titleKey: 'Help.modules.mails.step1Title',
        descriptionKey: 'Help.modules.mails.step1Desc',
      },
      {
        stepNumber: 2,
        titleKey: 'Help.modules.mails.step2Title',
        descriptionKey: 'Help.modules.mails.step2Desc',
      },
      {
        stepNumber: 3,
        titleKey: 'Help.modules.mails.step3Title',
        descriptionKey: 'Help.modules.mails.step3Desc',
      },
      {
        stepNumber: 4,
        titleKey: 'Help.modules.mails.step4Title',
        descriptionKey: 'Help.modules.mails.step4Desc',
      },
    ],
    routes: [
      { path: '/admin/mails', descriptionKey: 'Help.routes.mails.list' },
      { path: '/admin/mails/new', descriptionKey: 'Help.routes.mails.new' },
      { path: '/admin/mails/[id]', descriptionKey: 'Help.routes.mails.details' },
    ],
  },
];
