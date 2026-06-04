const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { authenticate, authorize, ROLES } = require('../middleware/auth');
const { parsePagination, asyncHandler } = require('../middleware/validate');

const prisma = new PrismaClient();

async function fetchExtinguisher(identifier) {
  if (!identifier) return null;
  const byId = identifier.match(/^[0-9a-fA-F-]{36}$/);
  if (byId) {
    const ext = await prisma.extinguisher.findUnique({
      where: { id: identifier },
      select: { id: true, serialNumber: true, location: true, type: true, assignedUserId: true },
    });
    if (ext) return ext;
  }
  return prisma.extinguisher.findFirst({
    where: { serialNumber: { equals: identifier, mode: 'insensitive' } },
    select: { id: true, serialNumber: true, location: true, type: true, assignedUserId: true },
  });
}

async function createNotification(userId, type, title, message, metadata) {
  try { await prisma.notification.create({ data: { userId, type, title, message, metadata } }); } catch {}
}

/**
 * @swagger
 * components:
 *   schemas:
 *     MaintenanceLogResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           example: "e5f6a7b8-c9d0-1234-efab-123456789012"
 *         extinguisherId:
 *           type: string
 *           format: uuid
 *           example: "d4e5f6a7-b8c9-0123-def0-456789abcdef"
 *         inspectorId:
 *           type: string
 *           format: uuid
 *           example: "b2c3d4e5-f6a7-8901-bcde-f01234567890"
 *         actionsTaken:
 *           type: string
 *           example: "Replaced pressure gauge. Refilled CO2 canister. Checked pin and safety seal."
 *         dateOfAction:
 *           type: string
 *           format: date-time
 *           example: "2026-06-01T00:00:00.000Z"
 *         conditionsNoted:
 *           type: string
 *           example: "Good condition. Minor corrosion on handle bracket noted."
 *         notes:
 *           type: string
 *           nullable: true
 *           example: "Schedule follow-up in 6 months"
 *         extinguisher:
 *           type: object
 *           nullable: true
 *           properties:
 *             id:
 *               type: string
 *               format: uuid
 *             serialNumber:
 *               type: string
 *             location:
 *               type: string
 *             type:
 *               type: string
 *             assignedUserId:
 *               type: string
 *               nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     PaginationMeta:
 *       type: object
 *       properties:
 *         total:
 *           type: integer
 *           example: 8
 *         page:
 *           type: integer
 *           example: 1
 *         limit:
 *           type: integer
 *           example: 20
 *         totalPages:
 *           type: integer
 *           example: 1
 *         hasNext:
 *           type: boolean
 *         hasPrev:
 *           type: boolean
 *     Error:
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *           example: "A descriptive error message"
 */

/**
 * @swagger
 * tags:
 *   name: Maintenance
 *   description: |
 *     Maintenance activity logging for fire extinguishers.
 *     Write operations (create, update, delete) require Inspector or Admin role.
 *     All authenticated users can read maintenance logs.
 */

// ─── POST / ───────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/maintenance:
 *   post:
 *     summary: Log a maintenance activity (Inspector / Admin)
 *     description: |
 *       Records a maintenance action performed on a fire extinguisher.
 *       Provide either `extinguisherId` (UUID) or `extinguisherSerialNumber`.
 *       If the extinguisher is assigned to a user, that user is notified automatically.
 *       `dateOfAction` cannot be in the future.
 *     tags: [Maintenance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [actionsTaken, dateOfAction, conditionsNoted]
 *             properties:
 *               extinguisherId:
 *                 type: string
 *                 format: uuid
 *                 description: UUID of the extinguisher (use this OR extinguisherSerialNumber)
 *                 example: "d4e5f6a7-b8c9-0123-def0-456789abcdef"
 *               extinguisherSerialNumber:
 *                 type: string
 *                 description: Serial number of the extinguisher (use this OR extinguisherId)
 *                 example: "FE-B001"
 *               actionsTaken:
 *                 type: string
 *                 description: Description of maintenance actions performed (min 5 characters)
 *                 example: "Replaced pressure gauge. Refilled CO2 canister. Checked pin and safety seal."
 *               dateOfAction:
 *                 type: string
 *                 format: date
 *                 description: Date the maintenance was performed (cannot be future)
 *                 example: "2026-06-01"
 *               conditionsNoted:
 *                 type: string
 *                 description: Conditions observed during maintenance (min 3 characters)
 *                 example: "Good condition. Minor corrosion on handle bracket noted."
 *               notes:
 *                 type: string
 *                 description: Optional additional notes or recommendations
 *                 example: "Schedule follow-up in 6 months"
 *           examples:
 *             byId:
 *               summary: Log by extinguisher UUID
 *               value:
 *                 extinguisherId: "d4e5f6a7-b8c9-0123-def0-456789abcdef"
 *                 actionsTaken: "Replaced pressure gauge. Refilled CO2 canister. Checked pin and safety seal."
 *                 dateOfAction: "2026-06-01"
 *                 conditionsNoted: "Good condition. Minor corrosion on handle bracket noted."
 *                 notes: "Schedule follow-up in 6 months"
 *             bySerial:
 *               summary: Log by serial number
 *               value:
 *                 extinguisherSerialNumber: "FE-B001"
 *                 actionsTaken: "Full service and recharge performed."
 *                 dateOfAction: "2026-06-01"
 *                 conditionsNoted: "Passed all checks."
 *     responses:
 *       201:
 *         description: Maintenance log created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Maintenance log created successfully"
 *                 log:
 *                   $ref: '#/components/schemas/MaintenanceLogResponse'
 *       400:
 *         description: Validation error (missing fields, future date, short text)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               missingFields:
 *                 value: { error: "Missing required fields: extinguisherId or extinguisherSerialNumber, actionsTaken" }
 *               futureDate:
 *                 value: { error: "dateOfAction cannot be in the future" }
 *               shortActions:
 *                 value: { error: "actionsTaken must be at least 5 characters" }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Inspector or Admin role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Extinguisher not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               value: { error: "Extinguisher not found" }
 */
router.post('/', authenticate, authorize(ROLES.ADMIN, ROLES.INSPECTOR), asyncHandler(async (req, res) => {
  const { extinguisherId, extinguisherSerialNumber, actionsTaken, dateOfAction, conditionsNoted, notes } = req.body;

  const identifier = extinguisherId || extinguisherSerialNumber;
  const missing = ['actionsTaken', 'dateOfAction', 'conditionsNoted'].filter(f => !req.body[f]);
  if (!identifier) missing.unshift('extinguisherId or extinguisherSerialNumber');
  if (missing.length) throw { status: 400, message: `Missing required fields: ${missing.join(', ')}` };

  if (actionsTaken.trim().length < 5)    throw { status: 400, message: 'actionsTaken must be at least 5 characters' };
  if (conditionsNoted.trim().length < 3) throw { status: 400, message: 'conditionsNoted must be at least 3 characters' };

  const date = new Date(dateOfAction);
  if (isNaN(date.getTime())) throw { status: 400, message: 'dateOfAction must be a valid date (YYYY-MM-DD)' };
  if (date > new Date()) throw { status: 400, message: 'dateOfAction cannot be in the future' };

  const extinguisher = await fetchExtinguisher(identifier);
  if (!extinguisher) throw { status: 404, message: 'Extinguisher not found' };

  const log = await prisma.maintenanceLog.create({
    data: {
      extinguisherId: extinguisher.id,
      inspectorId: req.user.id,
      actionsTaken: actionsTaken.trim(),
      dateOfAction: date,
      conditionsNoted: conditionsNoted.trim(),
      notes: notes?.trim() || null,
    },
  });

  if (extinguisher.assignedUserId) {
    await createNotification(
      extinguisher.assignedUserId,
      'maintenance_logged',
      'Maintenance Performed',
      `Maintenance was completed on your extinguisher ${extinguisher.serialNumber} on ${dateOfAction}.`,
      { logId: log.id, extinguisherId: extinguisher.id }
    );
  }

  res.status(201).json({ message: 'Maintenance log created successfully', log: { ...log, extinguisher } });
}));

// ─── GET / ────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/maintenance:
 *   get:
 *     summary: List maintenance logs with filters and pagination
 *     description: |
 *       Returns paginated maintenance logs.
 *       **Role rules:** Inspectors see only logs they created. Admins see all logs.
 *       Each log includes embedded extinguisher details.
 *     tags: [Maintenance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: extinguisherId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter logs for a specific extinguisher UUID
 *       - in: query
 *         name: extinguisherSerialNumber
 *         schema:
 *           type: string
 *         description: Filter logs by extinguisher serial number
 *         example: "FE-B001"
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *         description: Return logs with dateOfAction on or after this date
 *         example: "2026-01-01"
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *         description: Return logs with dateOfAction on or before this date
 *         example: "2026-12-31"
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *           minimum: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           minimum: 1
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Paginated list of maintenance logs with embedded extinguisher details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/MaintenanceLogResponse'
 *                 pagination:
 *                   $ref: '#/components/schemas/PaginationMeta'
 *       400:
 *         description: Invalid date range
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               badDate:
 *                 value: { error: "from must be a valid date" }
 *               badRange:
 *                 value: { error: "from must be before to" }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Extinguisher not found (when filtering by serial number)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { page, limit, skip, take } = parsePagination(req.query);
  const { extinguisherId, extinguisherSerialNumber, from, to } = req.query;

  if (from && isNaN(new Date(from).getTime())) throw { status: 400, message: 'from must be a valid date' };
  if (to   && isNaN(new Date(to).getTime()))   throw { status: 400, message: 'to must be a valid date' };
  if (from && to && new Date(from) > new Date(to)) throw { status: 400, message: 'from must be before to' };

  const where = {
    ...(req.user.role === ROLES.INSPECTOR && { inspectorId: req.user.id }),
    ...((from || to) && {
      dateOfAction: {
        ...(from && { gte: new Date(from) }),
        ...(to   && { lte: new Date(to) }),
      },
    }),
  };

  if (extinguisherId) where.extinguisherId = extinguisherId;
  if (!where.extinguisherId && extinguisherSerialNumber) {
    const ext = await fetchExtinguisher(extinguisherSerialNumber);
    if (!ext) throw { status: 404, message: 'Extinguisher not found' };
    where.extinguisherId = ext.id;
  }

  const [data, total] = await Promise.all([
    prisma.maintenanceLog.findMany({ where, skip, take, orderBy: { dateOfAction: 'desc' } }),
    prisma.maintenanceLog.count({ where }),
  ]);

  const extIds = Array.from(new Set(data.map(item => item.extinguisherId)));
  const extMap = {};
  if (extIds.length) {
    const extinguishers = await prisma.extinguisher.findMany({
      where: { id: { in: extIds } },
      select: { id: true, serialNumber: true, location: true, type: true, assignedUserId: true },
    });
    extinguishers.forEach(ext => { extMap[ext.id] = ext; });
  }

  res.json({
    data: data.map(item => ({ ...item, extinguisher: extMap[item.extinguisherId] || null })),
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit), hasNext: page * limit < total, hasPrev: page > 1 },
  });
}));

// ─── GET /:id ─────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/maintenance/{id}:
 *   get:
 *     summary: Get a single maintenance log by ID
 *     description: Returns full log details including embedded extinguisher info. Inspectors can only view logs they created.
 *     tags: [Maintenance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: UUID of the maintenance log
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Maintenance log with embedded extinguisher details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MaintenanceLogResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Access denied — inspectors can only view their own logs
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               value: { error: "Access denied" }
 *       404:
 *         description: Maintenance log not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               value: { error: "Maintenance log not found" }
 */
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const log = await prisma.maintenanceLog.findUnique({ where: { id: req.params.id } });
  if (!log) throw { status: 404, message: 'Maintenance log not found' };
  if (req.user.role === ROLES.INSPECTOR && log.inspectorId !== req.user.id) throw { status: 403, message: 'Access denied' };

  const extinguisher = await prisma.extinguisher.findUnique({
    where: { id: log.extinguisherId },
    select: { id: true, serialNumber: true, location: true, type: true, assignedUserId: true },
  });

  res.json({ ...log, extinguisher: extinguisher || null });
}));

// ─── PUT /:id ─────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/maintenance/{id}:
 *   put:
 *     summary: Update a maintenance log (Inspector / Admin)
 *     description: Update one or more fields of an existing maintenance log. At least one field must be provided. Date cannot be set to a future date.
 *     tags: [Maintenance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: UUID of the maintenance log to update
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               actionsTaken:
 *                 type: string
 *                 description: Updated description of actions performed
 *                 example: "Full recharge and pressure test completed."
 *               conditionsNoted:
 *                 type: string
 *                 description: Updated conditions observed
 *                 example: "Excellent condition after servicing."
 *               notes:
 *                 type: string
 *                 description: Updated additional notes (send empty string to clear)
 *                 example: "No follow-up required."
 *               dateOfAction:
 *                 type: string
 *                 format: date
 *                 description: Corrected date (cannot be future)
 *                 example: "2026-05-28"
 *           examples:
 *             updateConditions:
 *               summary: Update conditions and notes
 *               value: { conditionsNoted: "Excellent condition after servicing.", notes: "No follow-up required." }
 *             fixDate:
 *               summary: Correct the action date
 *               value: { dateOfAction: "2026-05-28" }
 *     responses:
 *       200:
 *         description: Maintenance log updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Maintenance log updated"
 *                 log:
 *                   $ref: '#/components/schemas/MaintenanceLogResponse'
 *       400:
 *         description: No fields provided or invalid date
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               noFields:
 *                 value: { error: "Provide at least one field to update" }
 *               futureDate:
 *                 value: { error: "dateOfAction cannot be in the future" }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Inspector or Admin role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Maintenance log not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put('/:id', authenticate, authorize(ROLES.ADMIN, ROLES.INSPECTOR), asyncHandler(async (req, res) => {
  const { actionsTaken, conditionsNoted, notes, dateOfAction } = req.body;
  if (!actionsTaken && !conditionsNoted && notes === undefined && !dateOfAction) {
    throw { status: 400, message: 'Provide at least one field to update' };
  }
  if (dateOfAction) {
    const d = new Date(dateOfAction);
    if (isNaN(d.getTime())) throw { status: 400, message: 'dateOfAction must be a valid date' };
    if (d > new Date()) throw { status: 400, message: 'dateOfAction cannot be in the future' };
  }
  const log = await prisma.maintenanceLog.update({
    where: { id: req.params.id },
    data: {
      ...(actionsTaken   && { actionsTaken: actionsTaken.trim() }),
      ...(conditionsNoted && { conditionsNoted: conditionsNoted.trim() }),
      ...(notes !== undefined && { notes: notes?.trim() || null }),
      ...(dateOfAction && { dateOfAction: new Date(dateOfAction) }),
    },
  });
  res.json({ message: 'Maintenance log updated', log });
}));

// ─── DELETE /:id ──────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/maintenance/{id}:
 *   delete:
 *     summary: Delete a maintenance log permanently (Admin only)
 *     description: Permanently removes the maintenance log record. This action is irreversible.
 *     tags: [Maintenance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: UUID of the maintenance log to delete
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Maintenance log deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Maintenance log deleted successfully"
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Admin role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Maintenance log not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete('/:id', authenticate, authorize(ROLES.ADMIN), asyncHandler(async (req, res) => {
  await prisma.maintenanceLog.delete({ where: { id: req.params.id } });
  res.json({ message: 'Maintenance log deleted successfully' });
}));

module.exports = router;
