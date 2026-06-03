const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { authenticate }  = require('../middleware/auth');
const { parsePagination, asyncHandler } = require('../middleware/validate');

const prisma = new PrismaClient();

/**
 * @swagger
 * tags:
 *   name: Notifications
 *   description: Per-user notification inbox
 */

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     summary: Get my notifications (paginated, newest first)
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: unread
 *         schema: { type: boolean }
 *         description: If true, only return unread notifications
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
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

/**
 * @swagger
 * /api/notifications/unread-count:
 *   get:
 *     summary: Get unread notification count only
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/unread-count', authenticate, asyncHandler(async (req, res) => {
  const count = await prisma.notification.count({ where: { userId: req.user.id, isRead: false } });
  res.json({ count });
}));

/**
 * @swagger
 * /api/notifications/{id}/read:
 *   patch:
 *     summary: Mark a notification as read
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 */
router.patch('/:id/read', authenticate, asyncHandler(async (req, res) => {
  const notif = await prisma.notification.findFirst({ where: { id: req.params.id, userId: req.user.id } });
  if (!notif) throw { status: 404, message: 'Notification not found' };
  await prisma.notification.update({ where: { id: req.params.id }, data: { isRead: true } });
  res.json({ message: 'Marked as read' });
}));

/**
 * @swagger
 * /api/notifications/read-all:
 *   patch:
 *     summary: Mark all my notifications as read
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 */
router.patch('/read-all', authenticate, asyncHandler(async (req, res) => {
  const { count } = await prisma.notification.updateMany({
    where: { userId: req.user.id, isRead: false },
    data:  { isRead: true },
  });
  res.json({ message: `${count} notification(s) marked as read` });
}));

/**
 * @swagger
 * /api/notifications/{id}:
 *   delete:
 *     summary: Delete a notification
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 */
router.delete('/:id', authenticate, asyncHandler(async (req, res) => {
  const notif = await prisma.notification.findFirst({ where: { id: req.params.id, userId: req.user.id } });
  if (!notif) throw { status: 404, message: 'Notification not found' };
  await prisma.notification.delete({ where: { id: req.params.id } });
  res.json({ message: 'Notification deleted' });
}));

module.exports = router;
