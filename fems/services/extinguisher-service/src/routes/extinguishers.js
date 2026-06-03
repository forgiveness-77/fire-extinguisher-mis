const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { authenticate, authorize, ROLES } = require('../middleware/auth');
const { parsePagination, asyncHandler } = require('../middleware/validate');
const { sendMail, templates } = require('../mailer');

const prisma = new PrismaClient();

const VALID_TYPES = ['Water', 'CO2', 'Foam', 'DryChemical'];

// ─── Status is COMPUTED, never stored ─────────────────────────────────────────
function computeStatus(ext) {
  if (new Date(ext.expiryDate) < new Date()) return 'expired';
  if (ext.assignedUserId) return 'active';
  return 'inactive';
}
const withStatus = (ext) => ({ ...ext, status: computeStatus(ext) });

async function createNotification(userId, type, title, message, metadata) {
  try { await prisma.notification.create({ data: { userId, type, title, message, metadata } }); } catch {}
}

/**
 * @swagger
 * tags:
 *   name: Extinguishers
 *   description: Fire extinguisher inventory. Status is computed — expired if past expiry, active if assigned to a user, inactive if unassigned.
 */

/**
 * @swagger
 * /api/extinguishers:
 *   post:
 *     summary: Register a new extinguisher (Admin / Inspector)
 *     tags: [Extinguishers]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [serialNumber, location, type, size, installationDate, expiryDate]
 *             properties:
 *               serialNumber:     { type: string, example: FE-B001 }
 *               location:         { type: string, example: "Floor 3 - Office Wing" }
 *               type:             { type: string, enum: [Water, CO2, Foam, DryChemical] }
 *               size:             { type: number, description: "Weight in lbs", example: 5 }
 *               installationDate: { type: string, format: date }
 *               expiryDate:       { type: string, format: date }
 */
router.post('/', authenticate, authorize(ROLES.ADMIN, ROLES.INSPECTOR), asyncHandler(async (req, res) => {
  const { serialNumber, location, type, size, installationDate, expiryDate } = req.body;
  const missing = ['serialNumber','location','type','size','installationDate','expiryDate'].filter(f => !req.body[f] && req.body[f] !== 0);
  if (missing.length) throw { status: 400, message: `Missing required fields: ${missing.join(', ')}` };
  if (!VALID_TYPES.includes(type)) throw { status: 400, message: `type must be one of: ${VALID_TYPES.join(', ')}` };

  const sizeNum = parseFloat(size);
  if (isNaN(sizeNum) || sizeNum <= 0) throw { status: 400, message: 'size must be a positive number (lbs)' };

  const install = new Date(installationDate);
  const expiry  = new Date(expiryDate);
  if (isNaN(install.getTime())) throw { status: 400, message: 'installationDate must be a valid date (YYYY-MM-DD)' };
  if (isNaN(expiry.getTime()))  throw { status: 400, message: 'expiryDate must be a valid date (YYYY-MM-DD)' };
  if (expiry <= install) throw { status: 400, message: 'expiryDate must be after installationDate' };

  const ext = await prisma.extinguisher.create({
    data: { serialNumber: serialNumber.trim().toUpperCase(), location: location.trim(), type, size: sizeNum, installationDate: install, expiryDate: expiry },
  });
  res.status(201).json({ message: 'Extinguisher registered', extinguisher: withStatus(ext) });
}));

/**
 * @swagger
 * /api/extinguishers:
 *   get:
 *     summary: List extinguishers (paginated). Users only see their assigned extinguisher.
 *     tags: [Extinguishers]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [active, inactive, expired] }
 *         description: Filter by computed status
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [Water, CO2, Foam, DryChemical] }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: assignedUserId
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 */
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { page, limit, skip, take } = parsePagination(req.query);
  const { status, type, search, assignedUserId } = req.query;

  if (type && !VALID_TYPES.includes(type)) throw { status: 400, message: `type must be one of: ${VALID_TYPES.join(', ')}` };

  // Users can only see their own assigned extinguisher
  if (req.user.role === ROLES.USER) {
    const myExt = await prisma.extinguisher.findFirst({ where: { assignedUserId: req.user.id } });
    return res.json({
      data: myExt ? [withStatus(myExt)] : [],
      pagination: { total: myExt ? 1 : 0, page: 1, limit: 1, totalPages: 1, hasNext: false, hasPrev: false },
    });
  }

  const now = new Date();
  // Build base where clause (excluding computed status which needs post-filter)
  const baseWhere = {
    ...(type && { type }),
    ...(assignedUserId && { assignedUserId }),
    ...(search && { OR: [{ serialNumber: { contains: search, mode: 'insensitive' } }, { location: { contains: search, mode: 'insensitive' } }] }),
  };

  // Apply computed status filter
  if (status === 'expired')  { baseWhere.expiryDate = { lt: now }; }
  else if (status === 'active') { baseWhere.expiryDate = { gte: now }; baseWhere.assignedUserId = { not: null }; }
  else if (status === 'inactive') { baseWhere.expiryDate = { gte: now }; baseWhere.assignedUserId = null; }

  const [raw, total] = await Promise.all([
    prisma.extinguisher.findMany({ where: baseWhere, skip, take, orderBy: { createdAt: 'desc' } }),
    prisma.extinguisher.count({ where: baseWhere }),
  ]);

  res.json({
    data: raw.map(withStatus),
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit), hasNext: page * limit < total, hasPrev: page > 1 },
  });
}));

router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const ext = await prisma.extinguisher.findUnique({ where: { id: req.params.id } });
  if (!ext) throw { status: 404, message: 'Extinguisher not found' };
  if (req.user.role === ROLES.USER && ext.assignedUserId !== req.user.id) throw { status: 403, message: 'Access denied' };
  res.json(withStatus(ext));
}));

router.put('/:id', authenticate, authorize(ROLES.ADMIN, ROLES.INSPECTOR), asyncHandler(async (req, res) => {
  const { location, type, size, installationDate, expiryDate } = req.body;
  if (!location && !type && size === undefined && !installationDate && !expiryDate) {
    throw { status: 400, message: 'Provide at least one field to update' };
  }
  if (type && !VALID_TYPES.includes(type)) throw { status: 400, message: `type must be one of: ${VALID_TYPES.join(', ')}` };

  const data = {
    ...(location && { location: location.trim() }),
    ...(type && { type }),
    ...(size !== undefined && { size: parseFloat(size) }),
    ...(installationDate && { installationDate: new Date(installationDate) }),
    ...(expiryDate && { expiryDate: new Date(expiryDate) }),
  };
  const ext = await prisma.extinguisher.update({ where: { id: req.params.id }, data });
  res.json({ message: 'Extinguisher updated', extinguisher: withStatus(ext) });
}));

router.delete('/:id', authenticate, authorize(ROLES.ADMIN), asyncHandler(async (req, res) => {
  await prisma.extinguisher.delete({ where: { id: req.params.id } });
  res.json({ message: 'Extinguisher deleted' });
}));

// ─── ASSIGN / UNASSIGN ───────────────────────────────────────────────────────
/**
 * @swagger
 * /api/extinguishers/{id}/assign:
 *   post:
 *     summary: Assign extinguisher to a user (Admin only). Sets status to active.
 *     tags: [Extinguishers]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId]
 *             properties:
 *               userId: { type: string, description: UUID of the user to assign }
 */
router.post('/:id/assign', authenticate, authorize(ROLES.ADMIN), asyncHandler(async (req, res) => {
  const { userId } = req.body;
  if (!userId) throw { status: 400, message: 'userId is required' };

  // Verify user exists
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, firstName: true, lastName: true, email: true } });
  if (!user) throw { status: 404, message: 'User not found' };

  // Verify extinguisher exists and not expired
  const ext = await prisma.extinguisher.findUnique({ where: { id: req.params.id } });
  if (!ext) throw { status: 404, message: 'Extinguisher not found' };
  if (new Date(ext.expiryDate) < new Date()) throw { status: 400, message: 'Cannot assign an expired extinguisher' };

  // Unassign from previous user if any
  if (ext.assignedUserId && ext.assignedUserId !== userId) {
    await createNotification(ext.assignedUserId, 'extinguisher_unassigned', 'Extinguisher Unassigned', `Extinguisher ${ext.serialNumber} has been unassigned from you.`, { extinguisherId: ext.id });
  }

  const updated = await prisma.extinguisher.update({ where: { id: ext.id }, data: { assignedUserId: userId } });

  // Notify user
  await createNotification(userId, 'extinguisher_assigned', 'Extinguisher Assigned', `Fire extinguisher ${ext.serialNumber} (${ext.location}) has been assigned to you.`, { extinguisherId: ext.id, serialNumber: ext.serialNumber });
  const tpl = templates.extinguisherAssigned(`${user.firstName} ${user.lastName}`, ext.serialNumber, ext.location);
  await sendMail({ to: user.email, ...tpl });

  res.json({ message: `Extinguisher ${ext.serialNumber} assigned to ${user.firstName} ${user.lastName}`, extinguisher: withStatus(updated) });
}));

/**
 * @swagger
 * /api/extinguishers/{id}/unassign:
 *   delete:
 *     summary: Unassign extinguisher from its user (Admin only). Sets status to inactive.
 *     tags: [Extinguishers]
 *     security: [{ bearerAuth: [] }]
 */
router.delete('/:id/unassign', authenticate, authorize(ROLES.ADMIN), asyncHandler(async (req, res) => {
  const ext = await prisma.extinguisher.findUnique({ where: { id: req.params.id } });
  if (!ext) throw { status: 404, message: 'Extinguisher not found' };
  if (!ext.assignedUserId) throw { status: 400, message: 'Extinguisher is not assigned to any user' };

  await createNotification(ext.assignedUserId, 'extinguisher_unassigned', 'Extinguisher Unassigned', `Extinguisher ${ext.serialNumber} has been unassigned from you.`, { extinguisherId: ext.id });

  const updated = await prisma.extinguisher.update({ where: { id: ext.id }, data: { assignedUserId: null } });
  res.json({ message: 'Extinguisher unassigned', extinguisher: withStatus(updated) });
}));

module.exports = router;
