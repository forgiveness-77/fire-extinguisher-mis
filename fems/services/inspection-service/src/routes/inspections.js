const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { authenticate, authorize, ROLES } = require('../middleware/auth');
const { parsePagination, asyncHandler } = require('../middleware/validate');
const { sendMail, templates } = require('../mailer');

const prisma = new PrismaClient();
const VALID_STATUSES = ['scheduled','confirmed','completed','cancelled'];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

async function fetchExtinguisher(identifier) {
  if (!identifier) return null;
  const byId = identifier.match(/^[0-9a-fA-F-]{36}$/);
  if (byId) {
    const ext = await prisma.extinguisher.findUnique({
      where: { id: identifier },
      select: { id: true, serialNumber: true, location: true, type: true, expiryDate: true, assignedUserId: true },
    });
    if (ext) return ext;
  }
  return prisma.extinguisher.findFirst({
    where: { serialNumber: { equals: identifier, mode: 'insensitive' } },
    select: { id: true, serialNumber: true, location: true, type: true, expiryDate: true, assignedUserId: true },
  });
}

async function createNotification(userId, type, title, message, metadata) {
  try { await prisma.notification.create({ data: { userId, type, title, message, metadata } }); } catch {}
}

/**
 * @swagger
 * components:
 *   schemas:
 *     InspectionResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           example: "c3d4e5f6-a7b8-9012-cdef-012345678901"
 *         extinguisherId:
 *           type: string
 *           format: uuid
 *           example: "d4e5f6a7-b8c9-0123-def0-456789abcdef"
 *         scheduledById:
 *           type: string
 *           format: uuid
 *           example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *         inspectorId:
 *           type: string
 *           format: uuid
 *           nullable: true
 *           example: null
 *         scheduledDate:
 *           type: string
 *           format: date-time
 *           example: "2026-07-20T00:00:00.000Z"
 *         scheduledTime:
 *           type: string
 *           example: "09:30"
 *         status:
 *           type: string
 *           enum: [scheduled, confirmed, completed, cancelled]
 *           example: scheduled
 *         notes:
 *           type: string
 *           nullable: true
 *           example: "Check pressure gauge carefully"
 *         notifyPersonnel:
 *           type: array
 *           items:
 *             type: string
 *             format: email
 *           example: ["safety@tzwltd.com"]
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
 *             expiryDate:
 *               type: string
 *               format: date-time
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
 *           example: 12
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
 *   name: Inspections
 *   description: |
 *     Inspection scheduling and tracking.
 *     Any authenticated user can schedule an inspection.
 *     Inspectors and Admins confirm, complete, or cancel inspections.
 *     **Statuses:** `scheduled` → `confirmed` → `completed` | `cancelled`
 */

// ─── POST / ───────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/inspections:
 *   post:
 *     summary: Schedule a new inspection
 *     description: |
 *       Schedules an inspection for a fire extinguisher. Provide either `extinguisherId` (UUID) or
 *       `extinguisherSerialNumber`. All active inspectors are notified automatically.
 *       If `notifyPersonnel` emails are provided, an email is sent to them too.
 *     tags: [Inspections]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [scheduledDate, scheduledTime]
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
 *               scheduledDate:
 *                 type: string
 *                 format: date
 *                 example: "2026-07-20"
 *               scheduledTime:
 *                 type: string
 *                 description: 24-hour time format HH:MM
 *                 example: "09:30"
 *               notes:
 *                 type: string
 *                 description: Optional notes for the inspector
 *                 example: "Check pressure gauge carefully"
 *               notifyPersonnel:
 *                 type: array
 *                 description: List of email addresses to notify about this inspection
 *                 items:
 *                   type: string
 *                   format: email
 *                 example: ["safety@tzwltd.com", "manager@tzwltd.com"]
 *           examples:
 *             byId:
 *               summary: Schedule by extinguisher UUID
 *               value:
 *                 extinguisherId: "d4e5f6a7-b8c9-0123-def0-456789abcdef"
 *                 scheduledDate: "2026-07-20"
 *                 scheduledTime: "09:30"
 *                 notes: "Annual inspection"
 *                 notifyPersonnel: ["safety@tzwltd.com"]
 *             bySerial:
 *               summary: Schedule by serial number
 *               value:
 *                 extinguisherSerialNumber: "FE-B001"
 *                 scheduledDate: "2026-07-20"
 *                 scheduledTime: "14:00"
 *                 notes: "Routine check"
 *                 notifyPersonnel: []
 *     responses:
 *       201:
 *         description: Inspection scheduled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Inspection scheduled"
 *                 inspection:
 *                   $ref: '#/components/schemas/InspectionResponse'
 *       400:
 *         description: Validation error (missing fields, invalid date/time format)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               noExtinguisher:
 *                 value: { error: "extinguisherId or extinguisherSerialNumber is required" }
 *               badDate:
 *                 value: { error: "scheduledDate must be a valid date" }
 *               badTime:
 *                 value: { error: "scheduledTime must be HH:MM (24-hour)" }
 *       401:
 *         description: Unauthorized
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
router.post('/', authenticate, asyncHandler(async (req, res) => {
  const { extinguisherId, extinguisherSerialNumber, scheduledDate, scheduledTime, notes, notifyPersonnel = [] } = req.body;
  const identifier = extinguisherId || extinguisherSerialNumber;
  if (!identifier) throw { status: 400, message: 'extinguisherId or extinguisherSerialNumber is required' };

  const dateObj = new Date(scheduledDate);
  if (!scheduledDate || isNaN(dateObj.getTime())) throw { status: 400, message: 'scheduledDate must be a valid date' };
  if (!scheduledTime || !TIME_RE.test(scheduledTime)) throw { status: 400, message: 'scheduledTime must be HH:MM (24-hour)' };
  if (!Array.isArray(notifyPersonnel)) throw { status: 400, message: 'notifyPersonnel must be an array' };

  const extinguisher = await fetchExtinguisher(identifier);
  if (!extinguisher) throw { status: 404, message: 'Extinguisher not found' };

  const inspection = await prisma.inspection.create({
    data: {
      extinguisherId: extinguisher.id,
      scheduledById: req.user.id,
      scheduledDate: dateObj,
      scheduledTime,
      notes: notes?.trim() || null,
      notifyPersonnel,
      status: 'scheduled',
    },
  });

  const responseInspection = {
    ...inspection,
    extinguisher,
  };

  // Notify all inspectors of the new request
  const inspectors = await prisma.user.findMany({ where: { role: 'inspector', status: 'active' }, select: { id: true, email: true } });
  for (const insp of inspectors) {
    await createNotification(
      insp.id,
      'inspection_scheduled',
      'New Inspection Request',
      `An inspection has been requested for extinguisher ${extinguisher.serialNumber} on ${scheduledDate} at ${scheduledTime}.`,
      { inspectionId: inspection.id, extinguisherId: extinguisher.id }
    );
  }

  if (notifyPersonnel.length) {
    const tpl = templates.inspectionScheduled(extinguisher.serialNumber, scheduledDate, scheduledTime, `${req.user.firstName} ${req.user.lastName}`);
    await sendMail({ to: notifyPersonnel, ...tpl });
  }

  res.status(201).json({ message: 'Inspection scheduled', inspection: responseInspection });
}));

// ─── GET / ────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/inspections:
 *   get:
 *     summary: List inspections with filters and pagination
 *     description: |
 *       Returns a paginated list of inspections.
 *       **Role rules:**
 *       - `user` — sees only inspections they scheduled
 *       - `inspector` — sees only inspections assigned to them
 *       - `admin` — sees all inspections
 *     tags: [Inspections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [scheduled, confirmed, completed, cancelled]
 *         description: Filter by inspection status
 *       - in: query
 *         name: extinguisherId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by extinguisher UUID
 *       - in: query
 *         name: extinguisherSerialNumber
 *         schema:
 *           type: string
 *         description: Filter by extinguisher serial number
 *         example: "FE-B001"
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter inspections scheduled on or after this date
 *         example: "2026-01-01"
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter inspections scheduled on or before this date
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
 *         description: Paginated list of inspections with embedded extinguisher details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/InspectionResponse'
 *                 pagination:
 *                   $ref: '#/components/schemas/PaginationMeta'
 *       400:
 *         description: Invalid status filter or date format
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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
  const { status, extinguisherId, extinguisherSerialNumber, from, to } = req.query;

  if (status && !VALID_STATUSES.includes(status)) throw { status: 400, message: `status must be one of: ${VALID_STATUSES.join(', ')}` };

  const where = {
    ...(status && { status }),
    ...(req.user.role === ROLES.USER && { scheduledById: req.user.id }),
    ...(req.user.role === ROLES.INSPECTOR && { inspectorId: req.user.id }),
    ...((from || to) && { scheduledDate: { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) } }),
  };

  if (extinguisherId) where.extinguisherId = extinguisherId;
  if (!where.extinguisherId && extinguisherSerialNumber) {
    const ext = await fetchExtinguisher(extinguisherSerialNumber);
    if (!ext) throw { status: 404, message: 'Extinguisher not found' };
    where.extinguisherId = ext.id;
  }

  const [data, total] = await Promise.all([
    prisma.inspection.findMany({ where, skip, take, orderBy: { scheduledDate: 'asc' } }),
    prisma.inspection.count({ where }),
  ]);

  const extIds = Array.from(new Set(data.map(item => item.extinguisherId)));
  const extMap = {};
  if (extIds.length) {
    const extinguishers = await prisma.extinguisher.findMany({
      where: { id: { in: extIds } },
      select: { id: true, serialNumber: true, location: true, type: true, expiryDate: true, assignedUserId: true },
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
 * /api/inspections/{id}:
 *   get:
 *     summary: Get a single inspection by ID
 *     description: Returns full inspection details including embedded extinguisher info. Users can only view inspections they scheduled.
 *     tags: [Inspections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: UUID of the inspection
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Inspection details with embedded extinguisher
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/InspectionResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Access denied — users can only view their own scheduled inspections
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               value: { error: "Access denied" }
 *       404:
 *         description: Inspection not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               value: { error: "Inspection not found" }
 */
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const insp = await prisma.inspection.findUnique({ where: { id: req.params.id } });
  if (!insp) throw { status: 404, message: 'Inspection not found' };
  if (req.user.role === ROLES.USER && insp.scheduledById !== req.user.id) throw { status: 403, message: 'Access denied' };

  const extinguisher = await prisma.extinguisher.findUnique({
    where: { id: insp.extinguisherId },
    select: { id: true, serialNumber: true, location: true, type: true, expiryDate: true, assignedUserId: true },
  });

  res.json({ ...insp, extinguisher: extinguisher || null });
}));

// ─── PUT /:id ─────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/inspections/{id}:
 *   put:
 *     summary: Update an inspection (Admin / Inspector)
 *     description: |
 *       Update one or more inspection fields. At least one field must be provided.
 *       When `status` changes, the person who scheduled the inspection is notified automatically.
 *       Use `inspectorId` to assign an inspector to the inspection.
 *     tags: [Inspections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: UUID of the inspection to update
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
 *               scheduledDate:
 *                 type: string
 *                 format: date
 *                 description: Reschedule to a new date
 *                 example: "2026-08-01"
 *               scheduledTime:
 *                 type: string
 *                 description: New time in HH:MM (24-hour) format
 *                 example: "10:00"
 *               status:
 *                 type: string
 *                 enum: [scheduled, confirmed, completed, cancelled]
 *                 example: confirmed
 *               notes:
 *                 type: string
 *                 description: Updated notes (send empty string to clear)
 *                 example: "Rescheduled due to maintenance window"
 *               inspectorId:
 *                 type: string
 *                 format: uuid
 *                 description: Assign an inspector to this inspection
 *                 example: "b2c3d4e5-f6a7-8901-bcde-f01234567890"
 *           examples:
 *             confirm:
 *               summary: Inspector confirms the inspection
 *               value: { status: "confirmed", inspectorId: "b2c3d4e5-f6a7-8901-bcde-f01234567890" }
 *             complete:
 *               summary: Mark inspection as completed
 *               value: { status: "completed", notes: "All checks passed. Pressure nominal." }
 *             cancel:
 *               summary: Cancel the inspection
 *               value: { status: "cancelled", notes: "Equipment out of service" }
 *             reschedule:
 *               summary: Reschedule to new date/time
 *               value: { scheduledDate: "2026-08-05", scheduledTime: "11:00" }
 *     responses:
 *       200:
 *         description: Inspection updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Inspection updated"
 *                 inspection:
 *                   $ref: '#/components/schemas/InspectionResponse'
 *       400:
 *         description: No fields provided or invalid values
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               noFields:
 *                 value: { error: "Provide at least one field to update" }
 *               invalidStatus:
 *                 value: { error: "status must be one of: scheduled, confirmed, completed, cancelled" }
 *               badTime:
 *                 value: { error: "scheduledTime must be HH:MM" }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Admin or Inspector role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Inspection not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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

// ─── DELETE /:id ──────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/inspections/{id}:
 *   delete:
 *     summary: Delete an inspection permanently (Admin only)
 *     description: Permanently removes the inspection record. This action is irreversible.
 *     tags: [Inspections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: UUID of the inspection to delete
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Inspection deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Inspection deleted successfully"
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
 *         description: Inspection not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete('/:id', authenticate, authorize(ROLES.ADMIN), asyncHandler(async (req, res) => {
  await prisma.inspection.delete({ where: { id: req.params.id } });
  res.json({ message: 'Inspection deleted successfully' });
}));

module.exports = router;
