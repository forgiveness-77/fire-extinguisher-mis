const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { authenticate, authorize, ROLES } = require('../middleware/auth');
const { parsePagination, asyncHandler } = require('../middleware/validate');
const { sendMail, templates } = require('../mailer');

const prisma = new PrismaClient();
const VALID_STATUSES = ['pending','confirmed','completed','cancelled'];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

async function createNotification(userId, type, title, message, metadata) {
  try { await prisma.notification.create({ data: { userId, type, title, message, metadata } }); } catch {}
}

/**
 * @swagger
 * tags:
 *   name: Inspections
 *   description: Users schedule inspections. Inspectors confirm and complete them.
 */

/**
 * @swagger
 * /api/inspections:
 *   post:
 *     summary: Schedule an inspection (All authenticated users)
 *     tags: [Inspections]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [extinguisherId, scheduledDate, scheduledTime]
 *             properties:
 *               extinguisherId: { type: string, description: UUID of extinguisher }
 *               scheduledDate:  { type: string, format: date }
 *               scheduledTime:  { type: string, example: "09:30" }
 *               notes:          { type: string }
 *               notifyEmails:   { type: array, items: { type: string, format: email } }
 */
router.post('/', authenticate, asyncHandler(async (req, res) => {
  const { extinguisherId, scheduledDate, scheduledTime, notes, notifyEmails = [] } = req.body;
  if (!extinguisherId) throw { status: 400, message: 'extinguisherId is required' };

  const dateObj = new Date(scheduledDate);
  if (!scheduledDate || isNaN(dateObj.getTime())) throw { status: 400, message: 'scheduledDate must be a valid date' };
  if (!scheduledTime || !TIME_RE.test(scheduledTime)) throw { status: 400, message: 'scheduledTime must be HH:MM (24-hour)' };
  if (!Array.isArray(notifyEmails)) throw { status: 400, message: 'notifyEmails must be an array' };

  const inspection = await prisma.inspection.create({
    data: {
      extinguisherId,
      scheduledById: req.user.id,
      scheduledDate: dateObj,
      scheduledTime,
      notes: notes?.trim() || null,
      notifyEmails,
      status: 'pending',
    },
  });

  // Notify all inspectors of the new request
  const inspectors = await prisma.user.findMany({ where: { role: 'inspector', status: 'active' }, select: { id: true, email: true } });
  for (const insp of inspectors) {
    await createNotification(insp.id, 'inspection_scheduled', 'New Inspection Request', `An inspection has been requested for extinguisher ${extinguisherId} on ${scheduledDate} at ${scheduledTime}.`, { inspectionId: inspection.id, extinguisherId });
  }

  if (notifyEmails.length) {
    const tpl = templates.inspectionScheduled(extinguisherId, scheduledDate, scheduledTime, `${req.user.firstName} ${req.user.lastName}`);
    await sendMail({ to: notifyEmails, ...tpl });
  }

  res.status(201).json({ message: 'Inspection scheduled', inspection });
}));

/**
 * @swagger
 * /api/inspections:
 *   get:
 *     summary: List inspections (paginated). Users see only theirs.
 *     tags: [Inspections]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, confirmed, completed, cancelled] }
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
  const { status, extinguisherId, from, to } = req.query;

  if (status && !VALID_STATUSES.includes(status)) throw { status: 400, message: `status must be one of: ${VALID_STATUSES.join(', ')}` };

  const where = {
    ...(status && { status }),
    ...(extinguisherId && { extinguisherId }),
    ...(req.user.role === ROLES.USER && { scheduledById: req.user.id }),
    ...(req.user.role === ROLES.INSPECTOR && { inspectorId: req.user.id }),
    ...((from || to) && { scheduledDate: { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) } }),
  };

  const [data, total] = await Promise.all([
    prisma.inspection.findMany({ where, skip, take, orderBy: { scheduledDate: 'asc' } }),
    prisma.inspection.count({ where }),
  ]);

  res.json({ data, pagination: { total, page, limit, totalPages: Math.ceil(total / limit), hasNext: page * limit < total, hasPrev: page > 1 } });
}));

router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const insp = await prisma.inspection.findUnique({ where: { id: req.params.id } });
  if (!insp) throw { status: 404, message: 'Inspection not found' };
  if (req.user.role === ROLES.USER && insp.scheduledById !== req.user.id) throw { status: 403, message: 'Access denied' };
  res.json(insp);
}));

/**
 * @swagger
 * /api/inspections/{id}:
 *   put:
 *     summary: Update inspection status (Admin / Inspector)
 *     tags: [Inspections]
 *     security: [{ bearerAuth: [] }]
 */
router.put('/:id', authenticate, authorize(ROLES.ADMIN, ROLES.INSPECTOR), asyncHandler(async (req, res) => {
  const { scheduledDate, scheduledTime, status, notes, inspectorId } = req.body;
  if (!scheduledDate && !scheduledTime && !status && notes === undefined && !inspectorId) {
    throw { status: 400, message: 'Provide at least one field to update' };
  }
  if (status && !VALID_STATUSES.includes(status)) throw { status: 400, message: `status must be one of: ${VALID_STATUSES.join(', ')}` };
  if (scheduledTime && !TIME_RE.test(scheduledTime)) throw { status: 400, message: 'scheduledTime must be HH:MM' };

  const insp = await prisma.inspection.findUnique({ where: { id: req.params.id } });
  if (!insp) throw { status: 404, message: 'Inspection not found' };

  const updated = await prisma.inspection.update({
    where: { id: req.params.id },
    data: {
      ...(scheduledDate && { scheduledDate: new Date(scheduledDate) }),
      ...(scheduledTime && { scheduledTime }),
      ...(status && { status }),
      ...(notes !== undefined && { notes: notes?.trim() || null }),
      ...(inspectorId && { inspectorId }),
    },
  });

  // Notify the person who scheduled it
  if (status && status !== insp.status) {
    await createNotification(insp.scheduledById, 'inspection_updated', 'Inspection Updated', `Your inspection on ${insp.scheduledDate.toISOString().split('T')[0]} is now ${status}.`, { inspectionId: insp.id });
  }

  res.json({ message: 'Inspection updated', inspection: updated });
}));

router.delete('/:id', authenticate, authorize(ROLES.ADMIN), asyncHandler(async (req, res) => {
  await prisma.inspection.delete({ where: { id: req.params.id } });
  res.json({ message: 'Inspection deleted' });
}));

module.exports = router;
