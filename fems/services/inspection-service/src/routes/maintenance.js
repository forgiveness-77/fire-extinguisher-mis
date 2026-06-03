const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { authenticate, authorize, ROLES } = require('../middleware/auth');
const { parsePagination, asyncHandler } = require('../middleware/validate');

const prisma = new PrismaClient();

async function createNotification(userId, type, title, message, metadata) {
  try { await prisma.notification.create({ data: { userId, type, title, message, metadata } }); } catch {}
}

/**
 * @swagger
 * tags:
 *   name: Maintenance
 *   description: Maintenance logs. Only Inspectors and Admins can create entries.
 */

/**
 * @swagger
 * /api/maintenance:
 *   post:
 *     summary: Log a maintenance activity (Inspector / Admin only)
 *     tags: [Maintenance]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [extinguisherId, actionsTaken, dateOfAction, conditionsNoted]
 *             properties:
 *               extinguisherId:  { type: string }
 *               actionsTaken:    { type: string }
 *               dateOfAction:    { type: string, format: date }
 *               conditionsNoted: { type: string }
 */
router.post('/', authenticate, authorize(ROLES.ADMIN, ROLES.INSPECTOR), asyncHandler(async (req, res) => {
  const { extinguisherId, actionsTaken, dateOfAction, conditionsNoted } = req.body;
  const missing = ['extinguisherId','actionsTaken','dateOfAction','conditionsNoted'].filter(f => !req.body[f]);
  if (missing.length) throw { status: 400, message: `Missing required fields: ${missing.join(', ')}` };

  if (actionsTaken.trim().length < 5) throw { status: 400, message: 'actionsTaken must be at least 5 characters' };
  if (conditionsNoted.trim().length < 5) throw { status: 400, message: 'conditionsNoted must be at least 5 characters' };

  const date = new Date(dateOfAction);
  if (isNaN(date.getTime())) throw { status: 400, message: 'dateOfAction must be a valid date (YYYY-MM-DD)' };
  if (date > new Date()) throw { status: 400, message: 'dateOfAction cannot be in the future' };

  const log = await prisma.maintenanceLog.create({
    data: {
      extinguisherId,
      inspectorId: req.user.id,
      actionsTaken: actionsTaken.trim(),
      dateOfAction: date,
      conditionsNoted: conditionsNoted.trim(),
    },
  });

  // Notify the user assigned to this extinguisher
  const ext = await prisma.extinguisher.findUnique({ where: { id: extinguisherId }, select: { assignedUserId: true, serialNumber: true } });
  if (ext?.assignedUserId) {
    await createNotification(ext.assignedUserId, 'maintenance_logged', 'Maintenance Completed', `Maintenance was performed on your extinguisher ${ext.serialNumber} on ${dateOfAction}.`, { logId: log.id, extinguisherId });
  }

  res.status(201).json({ message: 'Maintenance log created', log });
}));

/**
 * @swagger
 * /api/maintenance:
 *   get:
 *     summary: List maintenance logs (paginated)
 *     tags: [Maintenance]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: extinguisherId
 *         schema: { type: string }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 */
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { page, limit, skip, take } = parsePagination(req.query);
  const { extinguisherId, from, to } = req.query;

  if (from && isNaN(new Date(from).getTime())) throw { status: 400, message: 'from must be a valid date' };
  if (to && isNaN(new Date(to).getTime()))   throw { status: 400, message: 'to must be a valid date' };
  if (from && to && new Date(from) > new Date(to)) throw { status: 400, message: 'from must be before to' };

  const where = {
    ...(extinguisherId && { extinguisherId }),
    ...(req.user.role === ROLES.INSPECTOR && { inspectorId: req.user.id }),
    ...((from || to) && { dateOfAction: { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) } }),
  };

  const [data, total] = await Promise.all([
    prisma.maintenanceLog.findMany({ where, skip, take, orderBy: { dateOfAction: 'desc' } }),
    prisma.maintenanceLog.count({ where }),
  ]);

  res.json({ data, pagination: { total, page, limit, totalPages: Math.ceil(total / limit), hasNext: page * limit < total, hasPrev: page > 1 } });
}));

router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const log = await prisma.maintenanceLog.findUnique({ where: { id: req.params.id } });
  if (!log) throw { status: 404, message: 'Maintenance log not found' };
  if (req.user.role === ROLES.INSPECTOR && log.inspectorId !== req.user.id) throw { status: 403, message: 'Access denied' };
  res.json(log);
}));

router.put('/:id', authenticate, authorize(ROLES.ADMIN, ROLES.INSPECTOR), asyncHandler(async (req, res) => {
  const { actionsTaken, conditionsNoted, dateOfAction } = req.body;
  if (!actionsTaken && !conditionsNoted && !dateOfAction) throw { status: 400, message: 'Provide at least one field to update' };
  if (dateOfAction) {
    const d = new Date(dateOfAction);
    if (isNaN(d.getTime())) throw { status: 400, message: 'dateOfAction must be a valid date' };
    if (d > new Date()) throw { status: 400, message: 'dateOfAction cannot be in the future' };
  }
  const log = await prisma.maintenanceLog.update({
    where: { id: req.params.id },
    data: {
      ...(actionsTaken && { actionsTaken: actionsTaken.trim() }),
      ...(conditionsNoted && { conditionsNoted: conditionsNoted.trim() }),
      ...(dateOfAction && { dateOfAction: new Date(dateOfAction) }),
    },
  });
  res.json({ message: 'Log updated', log });
}));

router.delete('/:id', authenticate, authorize(ROLES.ADMIN), asyncHandler(async (req, res) => {
  await prisma.maintenanceLog.delete({ where: { id: req.params.id } });
  res.json({ message: 'Log deleted' });
}));

module.exports = router;
