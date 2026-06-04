const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { authenticate }  = require('../middleware/auth');
const { parsePagination, asyncHandler } = require('../middleware/validate');

const prisma = new PrismaClient();

/**
 * @swagger
 * components:
 *   schemas:
 *     NotificationResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           example: "f6a7b8c9-d0e1-2345-fabc-234567890123"
 *         userId:
 *           type: string
 *           format: uuid
 *           example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *         type:
 *           type: string
 *           description: Notification category
 *           example: "extinguisher_assigned"
 *         title:
 *           type: string
 *           example: "Extinguisher Assigned"
 *         message:
 *           type: string
 *           example: "Fire extinguisher FE-B001 (Floor 3 - Office Wing) has been assigned to you."
 *         isRead:
 *           type: boolean
 *           example: false
 *         metadata:
 *           type: object
 *           nullable: true
 *           description: Additional context (extinguisherId, inspectionId, etc.)
 *           example: { extinguisherId: "d4e5f6a7-b8c9-0123-def0-456789abcdef", serialNumber: "FE-B001" }
 *         createdAt:
 *           type: string
 *           format: date-time
 *           example: "2026-06-03T10:30:00.000Z"
 */

/**
 * @swagger
 * tags:
 *   name: Notifications
 *   description: |
 *     Per-user notification inbox. All operations are scoped to the authenticated user —
 *     you can only read, mark, or delete your own notifications.
 *     **Notification types:** `extinguisher_assigned`, `extinguisher_unassigned`,
 *     `inspection_scheduled`, `inspection_updated`, `maintenance_logged`,
 *     `inspector_pending`, `inspector_approved`
 */

// ─── GET / ────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/notifications:
 *   get:
 *     summary: Get my notifications (paginated, newest first)
 *     description: Returns all notifications for the authenticated user, ordered newest first. Use `unread=true` to show only unread ones.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: unread
 *         schema:
 *           type: boolean
 *         description: If `true`, returns only unread notifications
 *         example: true
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
 *         description: Paginated list of notifications with unread count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/NotificationResponse'
 *                 unreadCount:
 *                   type: integer
 *                   description: Total unread notifications for this user (regardless of filters)
 *                   example: 3
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                       example: 5
 *                     page:
 *                       type: integer
 *                       example: 1
 *                     limit:
 *                       type: integer
 *                       example: 20
 *                     totalPages:
 *                       type: integer
 *                       example: 1
 *                     hasNext:
 *                       type: boolean
 *                     hasPrev:
 *                       type: boolean
 *             example:
 *               data:
 *                 - id: "f6a7b8c9-d0e1-2345-fabc-234567890123"
 *                   userId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                   type: "extinguisher_assigned"
 *                   title: "Extinguisher Assigned"
 *                   message: "Fire extinguisher FE-B001 has been assigned to you."
 *                   isRead: false
 *                   metadata: { extinguisherId: "d4e5f6a7-b8c9-0123-def0-456789abcdef" }
 *                   createdAt: "2026-06-03T10:30:00.000Z"
 *               unreadCount: 1
 *               pagination:
 *                 total: 1
 *                 page: 1
 *                 limit: 20
 *                 totalPages: 1
 *                 hasNext: false
 *                 hasPrev: false
 *       401:
 *         description: Unauthorized — missing or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { page, limit, skip, take } = parsePagination(req.query);
  const unread = req.query.unread === 'true';

  const where = { userId: req.user.id, ...(unread && { isRead: false }) };

  const [data, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: req.user.id, isRead: false } }),
  ]);

  res.json({
    data,
    unreadCount,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit), hasNext: page * limit < total, hasPrev: page > 1 },
  });
}));

// ─── GET /unread-count ────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/notifications/unread-count:
 *   get:
 *     summary: Get unread notification count
 *     description: Returns only the count of unread notifications for the authenticated user. Lightweight — use this to drive badge indicators.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Unread notification count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count:
 *                   type: integer
 *                   description: Number of unread notifications
 *                   example: 3
 *             example:
 *               count: 3
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/unread-count', authenticate, asyncHandler(async (req, res) => {
  const count = await prisma.notification.count({ where: { userId: req.user.id, isRead: false } });
  res.json({ count });
}));

// ─── PATCH /read-all ──────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/notifications/read-all:
 *   patch:
 *     summary: Mark all my notifications as read
 *     description: Marks every unread notification for the authenticated user as read in a single operation.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications marked as read
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "3 notification(s) marked as read"
 *             example:
 *               message: "3 notification(s) marked as read"
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.patch('/read-all', authenticate, asyncHandler(async (req, res) => {
  const { count } = await prisma.notification.updateMany({
    where: { userId: req.user.id, isRead: false },
    data:  { isRead: true },
  });
  res.json({ message: `${count} notification(s) marked as read` });
}));

// ─── PATCH /:id/read ──────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/notifications/{id}/read:
 *   patch:
 *     summary: Mark a single notification as read
 *     description: Marks the specified notification as read. You can only mark your own notifications.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: UUID of the notification to mark as read
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Notification marked as read
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Marked as read"
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Notification not found or does not belong to you
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               value: { error: "Notification not found" }
 */
router.patch('/:id/read', authenticate, asyncHandler(async (req, res) => {
  const notif = await prisma.notification.findFirst({ where: { id: req.params.id, userId: req.user.id } });
  if (!notif) throw { status: 404, message: 'Notification not found' };
  await prisma.notification.update({ where: { id: req.params.id }, data: { isRead: true } });
  res.json({ message: 'Marked as read' });
}));

// ─── DELETE /:id ──────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/notifications/{id}:
 *   delete:
 *     summary: Delete a notification
 *     description: Permanently removes the specified notification. You can only delete your own notifications.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: UUID of the notification to delete
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Notification deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Notification deleted"
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Notification not found or does not belong to you
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               value: { error: "Notification not found" }
 */
router.delete('/:id', authenticate, asyncHandler(async (req, res) => {
  const notif = await prisma.notification.findFirst({ where: { id: req.params.id, userId: req.user.id } });
  if (!notif) throw { status: 404, message: 'Notification not found' };
  await prisma.notification.delete({ where: { id: req.params.id } });
  res.json({ message: 'Notification deleted' });
}));

module.exports = router;
