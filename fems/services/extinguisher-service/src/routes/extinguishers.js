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
 * components:
 *   schemas:
 *     ExtinguisherResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           example: "d4e5f6a7-b8c9-0123-def0-456789abcdef"
 *         serialNumber:
 *           type: string
 *           example: "FE-B001"
 *         location:
 *           type: string
 *           example: "Floor 3 - Office Wing"
 *         type:
 *           type: string
 *           enum: [Water, CO2, Foam, DryChemical]
 *           example: CO2
 *         size:
 *           type: number
 *           description: Weight in lbs
 *           example: 5
 *         installationDate:
 *           type: string
 *           format: date-time
 *           example: "2022-01-15T00:00:00.000Z"
 *         expiryDate:
 *           type: string
 *           format: date-time
 *           example: "2027-01-15T00:00:00.000Z"
 *         assignedUserId:
 *           type: string
 *           format: uuid
 *           nullable: true
 *           example: null
 *         status:
 *           type: string
 *           enum: [active, inactive, expired]
 *           description: Computed — expired if past expiry, active if assigned, inactive if unassigned
 *           example: inactive
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
 *           example: 42
 *         page:
 *           type: integer
 *           example: 1
 *         limit:
 *           type: integer
 *           example: 20
 *         totalPages:
 *           type: integer
 *           example: 3
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
 *   name: Extinguishers
 *   description: |
 *     Fire extinguisher inventory management.
 *     **Status is computed** — `expired` if past expiry date, `active` if assigned to a user, `inactive` if unassigned.
 */

// ─── POST / ───────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/extinguishers:
 *   post:
 *     summary: Register a new fire extinguisher
 *     description: Creates a new extinguisher record. Requires Admin or Inspector role.
 *     tags: [Extinguishers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [serialNumber, location, type, size, installationDate, expiryDate]
 *             properties:
 *               serialNumber:
 *                 type: string
 *                 description: Unique serial number (stored uppercase)
 *                 example: "FE-B001"
 *               location:
 *                 type: string
 *                 description: Physical location of the extinguisher
 *                 example: "Floor 3 - Office Wing"
 *               type:
 *                 type: string
 *                 enum: [Water, CO2, Foam, DryChemical]
 *                 example: CO2
 *               size:
 *                 type: number
 *                 description: Weight in lbs (must be positive)
 *                 example: 5
 *               installationDate:
 *                 type: string
 *                 format: date
 *                 example: "2022-01-15"
 *               expiryDate:
 *                 type: string
 *                 format: date
 *                 description: Must be after installationDate
 *                 example: "2027-01-15"
 *           examples:
 *             co2Example:
 *               summary: CO2 extinguisher
 *               value:
 *                 serialNumber: "FE-B001"
 *                 location: "Floor 3 - Office Wing"
 *                 type: "CO2"
 *                 size: 5
 *                 installationDate: "2022-01-15"
 *                 expiryDate: "2027-01-15"
 *             waterExample:
 *               summary: Water extinguisher
 *               value:
 *                 serialNumber: "FE-W002"
 *                 location: "Lobby - Ground Floor"
 *                 type: "Water"
 *                 size: 9
 *                 installationDate: "2023-06-01"
 *                 expiryDate: "2028-06-01"
 *     responses:
 *       201:
 *         description: Extinguisher registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Extinguisher registered"
 *                 extinguisher:
 *                   $ref: '#/components/schemas/ExtinguisherResponse'
 *       400:
 *         description: Validation error (missing fields, invalid type/date, expiry before install)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               missingFields:
 *                 value: { error: "Missing required fields: serialNumber, expiryDate" }
 *               invalidType:
 *                 value: { error: "type must be one of: Water, CO2, Foam, DryChemical" }
 *               badExpiry:
 *                 value: { error: "expiryDate must be after installationDate" }
 *       401:
 *         description: Unauthorized — missing or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden — Admin or Inspector role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: Serial number already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               value: { error: "Serial number already exists" }
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

// ─── GET / ────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/extinguishers:
 *   get:
 *     summary: List all extinguishers with filters and pagination
 *     description: |
 *       Returns a paginated list of extinguishers.
 *       **Role rules:** Users (`user` role) only see their own assigned extinguisher.
 *       Admins and Inspectors see all records and can apply filters.
 *     tags: [Extinguishers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive, expired]
 *         description: Filter by computed status
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [Water, CO2, Foam, DryChemical]
 *         description: Filter by extinguisher type
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Case-insensitive search on serialNumber or location
 *         example: "FE-B"
 *       - in: query
 *         name: assignedUserId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by assigned user UUID
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
 *         description: Paginated list of extinguishers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ExtinguisherResponse'
 *                 pagination:
 *                   $ref: '#/components/schemas/PaginationMeta'
 *             example:
 *               data:
 *                 - id: "d4e5f6a7-b8c9-0123-def0-456789abcdef"
 *                   serialNumber: "FE-B001"
 *                   location: "Floor 3 - Office Wing"
 *                   type: "CO2"
 *                   size: 5
 *                   installationDate: "2022-01-15T00:00:00.000Z"
 *                   expiryDate: "2027-01-15T00:00:00.000Z"
 *                   assignedUserId: null
 *                   status: "inactive"
 *                   createdAt: "2022-01-15T10:00:00.000Z"
 *                   updatedAt: "2022-01-15T10:00:00.000Z"
 *               pagination:
 *                 total: 1
 *                 page: 1
 *                 limit: 20
 *                 totalPages: 1
 *                 hasNext: false
 *                 hasPrev: false
 *       400:
 *         description: Invalid filter value
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

// ─── GET /:id ─────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/extinguishers/{id}:
 *   get:
 *     summary: Get a single extinguisher by ID
 *     description: Users can only access their own assigned extinguisher. Admins and Inspectors can access any.
 *     tags: [Extinguishers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: UUID of the extinguisher
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Extinguisher details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ExtinguisherResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Access denied — users can only access their own assigned extinguisher
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               value: { error: "Access denied" }
 *       404:
 *         description: Extinguisher not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               value: { error: "Extinguisher not found" }
 */
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const ext = await prisma.extinguisher.findUnique({ where: { id: req.params.id } });
  if (!ext) throw { status: 404, message: 'Extinguisher not found' };
  if (req.user.role === ROLES.USER && ext.assignedUserId !== req.user.id) throw { status: 403, message: 'Access denied' };
  res.json(withStatus(ext));
}));

// ─── PUT /:id ─────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/extinguishers/{id}:
 *   put:
 *     summary: Update an extinguisher's details (Admin / Inspector)
 *     description: Update one or more fields. At least one field must be provided. serialNumber cannot be changed after creation.
 *     tags: [Extinguishers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: UUID of the extinguisher to update
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
 *               location:
 *                 type: string
 *                 example: "Floor 4 - Meeting Room B"
 *               type:
 *                 type: string
 *                 enum: [Water, CO2, Foam, DryChemical]
 *                 example: Foam
 *               size:
 *                 type: number
 *                 description: New weight in lbs
 *                 example: 9
 *               installationDate:
 *                 type: string
 *                 format: date
 *                 example: "2023-03-01"
 *               expiryDate:
 *                 type: string
 *                 format: date
 *                 example: "2028-03-01"
 *           examples:
 *             updateLocation:
 *               summary: Move to a new location
 *               value: { location: "Floor 4 - Meeting Room B" }
 *             extendExpiry:
 *               summary: Extend expiry date
 *               value: { expiryDate: "2029-01-15" }
 *     responses:
 *       200:
 *         description: Extinguisher updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Extinguisher updated"
 *                 extinguisher:
 *                   $ref: '#/components/schemas/ExtinguisherResponse'
 *       400:
 *         description: No fields provided or invalid values
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               noFields:
 *                 value: { error: "Provide at least one field to update" }
 *               invalidType:
 *                 value: { error: "type must be one of: Water, CO2, Foam, DryChemical" }
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
 *         description: Extinguisher not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
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

// ─── DELETE /:id ──────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/extinguishers/{id}:
 *   delete:
 *     summary: Delete an extinguisher permanently (Admin only)
 *     description: Permanently removes the extinguisher and all associated records. This action is irreversible.
 *     tags: [Extinguishers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: UUID of the extinguisher to delete
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Extinguisher deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Extinguisher deleted successfully"
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
 *         description: Extinguisher not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete('/:id', authenticate, authorize(ROLES.ADMIN), asyncHandler(async (req, res) => {
  await prisma.extinguisher.delete({ where: { id: req.params.id } });
  res.json({ message: 'Extinguisher deleted successfully' });
}));

// ─── ASSIGN ───────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/extinguishers/{id}/assign:
 *   post:
 *     summary: Assign an extinguisher to a user (Admin only)
 *     description: |
 *       Assigns the extinguisher to the specified user, setting its computed status to `active`.
 *       If previously assigned to another user, that user is notified and unassigned first.
 *       An email notification is sent to the newly assigned user.
 *       Cannot assign an expired extinguisher.
 *     tags: [Extinguishers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: UUID of the extinguisher to assign
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId]
 *             properties:
 *               userId:
 *                 type: string
 *                 format: uuid
 *                 description: UUID of the user to assign the extinguisher to
 *                 example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *           example:
 *             userId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *     responses:
 *       200:
 *         description: Extinguisher assigned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Extinguisher FE-B001 assigned to John Doe"
 *                 extinguisher:
 *                   $ref: '#/components/schemas/ExtinguisherResponse'
 *       400:
 *         description: Missing userId or extinguisher is expired
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               missingUserId:
 *                 value: { error: "userId is required" }
 *               expired:
 *                 value: { error: "Cannot assign an expired extinguisher" }
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
 *         description: Extinguisher or user not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               userNotFound:
 *                 value: { error: "User not found" }
 *               extNotFound:
 *                 value: { error: "Extinguisher not found" }
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

// ─── UNASSIGN ─────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/extinguishers/{id}/unassign:
 *   delete:
 *     summary: Unassign an extinguisher from its user (Admin only)
 *     description: Removes the user assignment from the extinguisher. The computed status becomes `inactive`. The previously assigned user is notified.
 *     tags: [Extinguishers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: UUID of the extinguisher to unassign
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Extinguisher unassigned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Extinguisher unassigned"
 *                 extinguisher:
 *                   $ref: '#/components/schemas/ExtinguisherResponse'
 *       400:
 *         description: Extinguisher is not currently assigned to any user
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               value: { error: "Extinguisher is not assigned to any user" }
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
 *         description: Extinguisher not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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
