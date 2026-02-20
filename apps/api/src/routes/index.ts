import { Router } from 'express';
import healthRoutes from './health';
import authRoutes from './auth';
import userRoutes from './users';
import stationRoutes from './stations';
import shiftRoutes from './shifts';
import priceRoutes from './prices';
import tankRoutes from './tanks';
import pumpRoutes from './pumps';
import nozzleRoutes from './nozzles';
import supplierRoutes from './suppliers';
import invoiceRoutes from './invoices';
import fileRoutes from './files';
import deliveryRoutes from './deliveries';
import expenseRoutes from './expenses';
import checklistTemplateRoutes from './checklist-templates';
import checklistRoutes from './checklists';
import incidentRoutes from './incidents';
import notificationRoutes from './notifications';
import mailRoutes from './mails';
import statsRoutes from './stats';
import exportRoutes from './exports';

const router: Router = Router();

// Health (no auth required)
router.use('/', healthRoutes);

// Auth & Users
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/stations', stationRoutes);
router.use('/shifts', shiftRoutes);
router.use('/prices', priceRoutes);
router.use('/tanks', tankRoutes);
router.use('/pumps', pumpRoutes);
router.use('/nozzles', nozzleRoutes);
router.use('/suppliers', supplierRoutes);
router.use('/invoices', invoiceRoutes);
router.use('/files', fileRoutes);
router.use('/deliveries', deliveryRoutes);
router.use('/expenses', expenseRoutes);
router.use('/checklist-templates', checklistTemplateRoutes);
router.use('/checklists', checklistRoutes);
router.use('/incidents', incidentRoutes);
router.use('/notifications', notificationRoutes);
router.use('/mails', mailRoutes);
router.use('/stats', statsRoutes);
router.use('/exports', exportRoutes);

// Future route modules will be mounted here:
// router.use('/api/v1/stations', stationsRoutes);
// router.use('/api/v1/shifts', shiftsRoutes);
// router.use('/api/v1/prices', pricesRoutes);
// router.use('/api/v1/suppliers', suppliersRoutes);
// router.use('/api/v1/invoices', invoicesRoutes);
// router.use('/api/v1/expenses', expensesRoutes);
// router.use('/api/v1/replenishment-requests', replenishmentRoutes);
// router.use('/api/v1/deliveries', deliveriesRoutes);
// router.use('/api/v1/checklist-templates', checklistTemplatesRoutes);
// router.use('/api/v1/checklists', checklistsRoutes);
// router.use('/api/v1/incidents', incidentsRoutes);
// router.use('/api/v1/mails', mailsRoutes);
// router.use('/api/v1/notifications', notificationsRoutes);
// router.use('/api/v1/stats', statsRoutes);
// router.use('/api/v1/files', filesRoutes);

export default router;
