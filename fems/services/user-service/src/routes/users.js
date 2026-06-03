const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { authenticate, authorize, ROLES } = require('../middleware/auth');
const { parsePagination, parseId, asyncHandler } = require('../middleware/validate');
const { sendMail, templates } = require('../mailer');

const prisma = new PrismaClient();
const VALID_ROLES   = ['admin', 'inspector', 'user'];
const VALID_STATUSES = ['active', 'pending', 'suspended'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── helpers ─────────────────────────────────────────────────────────────────
async function createNotification(userId, type, title, message, metadata) {
  try {
    await prisma.notification.create({ data: { userId, type, title, message, metadata } });
  } catch {}
}

async function notifyAllAdmins(type, title, message, metadata) {
  const admins = await prisma.user.findMany({ where: { role: 'admin', status: 'active' }, select: { id: true } });
  await Promise.all(admins.map(a => createNotification(a.id, type, title, message, metadata)));
}

// ─── REGISTER ────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/users/register:
 *   post:
 *     summary: Register a new user. Inspectors start with status=pending awaiting admin approval.
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [firstName, lastName, email, password, role]
 *             properties:
 *               firstName: { type: string, example: John }
 *               lastName:  { type: string, example: Doe }
 *               email:     { type: string, format: email }
 *               password:  { type: string, minLength: 6 }
 *               role:      { type: string, enum: [admin, inspector, user] }
 *     responses:
 *       201: { description: Registered }
 *       400: { description: Validation error }
 *       409: { description: Email taken }
 */
router.post('/register', asyncHandler(async (req, res) => {
  const { firstName, lastName, email, password, role } = req.body;
  const missing = ['firstName','lastName','email','password','role'].filter(f => !req.body[f]);
  if (missing.length) throw { status: 400, message: `Missing required fields: ${missing.join(', ')}` };
  if (!EMAIL_RE.test(email)) throw { status: 400, message: 'Invalid email address' };
  if (!VALID_ROLES.includes(role)) throw { status: 400, message: `role must be one of: ${VALID_ROLES.join(', ')}` };
  if (password.length < 6) throw { status: 400, message: 'Password must be at least 6 characters' };

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) throw { status: 409, message: 'Email already registered' };

  // Inspectors wait for approval; admins and users are active immediately
  const status = role === 'inspector' ? 'pending' : 'active';
  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: { firstName: firstName.trim(), lastName: lastName.trim(), email: email.toLowerCase(), passwordHash, role, status },
    select: { id: true, firstName: true, lastName: true, email: true, role: true, status: true, createdAt: true },
  });

  if (role === 'inspector') {
    // Email inspector
    const tpl = templates.inspectorPending(`${firstName} ${lastName}`);
    await sendMail({ to: email, ...tpl });
    // Email all admins
    const adminTpl = templates.adminNewInspector(`${firstName} ${lastName}`, email);
    const admins = await prisma.user.findMany({ where: { role: 'admin', status: 'active' }, select: { email: true } });
    if (admins.length) await sendMail({ to: admins.map(a => a.email), ...adminTpl });
    // In-app notification for admins
    await notifyAllAdmins('inspector_pending', 'New Inspector Pending', `${firstName} ${lastName} (${email}) registered as inspector and awaits approval.`, { userId: user.id, email });
  }

  res.status(201).json({
    message: role === 'inspector'
      ? 'Registration received. Please wait for admin approval before logging in.'
      : 'User registered successfully',
    user,
  });
}));

// ─── LOGIN ───────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/users/login:
 *   post:
 *     summary: Login and receive JWT
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:    { type: string, format: email, example: fpeacelove77@gmail.com }
 *               password: { type: string, example: fpeacelove77 }
 *     responses:
 *       200: { description: Login successful }
 *       401: { description: Invalid credentials }
 *       403: { description: Account pending or suspended }
 */
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw { status: 400, message: 'email and password are required' };

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) throw { status: 401, message: 'Invalid credentials' };

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw { status: 401, message: 'Invalid credentials' };

  if (user.status === 'pending')   throw { status: 403, message: 'Account pending admin approval. Check your email for updates.' };
  if (user.status === 'suspended') throw { status: 403, message: 'Account suspended. Contact the system administrator.' };

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName, status: user.status },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES || '24h' }
  );

  res.json({
    message: 'Login successful',
    token,
    user: { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email, role: user.role, status: user.status },
  });
}));

// ─── PROFILE ─────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/users/profile:
 *   get:
 *     summary: Get my profile
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Profile }
 */
router.get('/profile', authenticate, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, firstName: true, lastName: true, email: true, role: true, status: true, createdAt: true, updatedAt: true },
  });
  if (!user) throw { status: 404, message: 'User not found' };
  res.json(user);
}));

/**
 * @swagger
 * /api/users/profile:
 *   put:
 *     summary: Update my profile
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 */
router.put('/profile', authenticate, asyncHandler(async (req, res) => {
  const { firstName, lastName } = req.body;
  if (!firstName && !lastName) throw { status: 400, message: 'Provide at least firstName or lastName' };
  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: { ...(firstName && { firstName: firstName.trim() }), ...(lastName && { lastName: lastName.trim() }) },
    select: { id: true, firstName: true, lastName: true, email: true, role: true, updatedAt: true },
  });
  res.json({ message: 'Profile updated', user });
}));

// ─── CHANGE PASSWORD ─────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/users/change-password:
 *   put:
 *     summary: Change password
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 */
router.put('/change-password', authenticate, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) throw { status: 400, message: 'currentPassword and newPassword required' };
  if (newPassword.length < 6) throw { status: 400, message: 'New password must be at least 6 characters' };
  if (currentPassword === newPassword) throw { status: 400, message: 'New password must differ from current' };

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!await bcrypt.compare(currentPassword, user.passwordHash)) throw { status: 400, message: 'Current password is incorrect' };

  await prisma.user.update({ where: { id: req.user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 12) } });
  res.json({ message: 'Password changed successfully' });
}));

// ─── RECOVER PASSWORD ────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/users/recover-password:
 *   post:
 *     summary: Request password reset token
 *     tags: [Users]
 */
router.post('/recover-password', asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) throw { status: 400, message: 'email is required' };

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) return res.json({ message: 'If that email exists, a reset token has been sent.' });

  const token = crypto.randomBytes(32).toString('hex');
  await prisma.user.update({ where: { id: user.id }, data: { resetToken: token, resetExpiry: new Date(Date.now() + 3600000) } });

  await sendMail({
    to: email,
    subject: 'TZW LTD – Password Reset',
    html: `<div style="font-family:Arial;max-width:520px;margin:0 auto">
      <div style="background:#DC143C;padding:24px 32px"><h2 style="color:white;margin:0">TZW LTD FEMS</h2></div>
      <div style="padding:32px;background:#fff8f0;border:1px solid #fecdd3">
        <h3>Password Reset</h3>
        <p>Your reset token (expires in 1 hour):</p>
        <p style="font-size:18px;letter-spacing:2px;background:#fecdd3;padding:12px 16px;border-radius:6px;font-family:monospace">${token}</p>
        <p>Use <code>POST /api/users/reset-password</code> with this token and your new password.</p>
      </div>
    </div>`,
  });

  res.json({ message: 'If that email exists, a reset token has been sent.' });
}));

/**
 * @swagger
 * /api/users/reset-password:
 *   post:
 *     summary: Reset password using token
 *     tags: [Users]
 */
router.post('/reset-password', asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) throw { status: 400, message: 'token and newPassword required' };
  if (newPassword.length < 6) throw { status: 400, message: 'Password must be at least 6 characters' };

  const user = await prisma.user.findFirst({ where: { resetToken: token, resetExpiry: { gt: new Date() } } });
  if (!user) throw { status: 400, message: 'Invalid or expired reset token' };

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, 12), resetToken: null, resetExpiry: null },
  });
  res.json({ message: 'Password reset successfully. Please login.' });
}));

// ─── INSPECTOR APPROVAL ───────────────────────────────────────────────────────
/**
 * @swagger
 * /api/users/pending:
 *   get:
 *     summary: List pending inspector registrations (Admin only)
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/pending', authenticate, authorize(ROLES.ADMIN), asyncHandler(async (req, res) => {
  const { page, limit, skip, take } = parsePagination(req.query);
  const [data, total] = await Promise.all([
    prisma.user.findMany({
      where: { role: 'inspector', status: 'pending' },
      skip, take,
      select: { id: true, firstName: true, lastName: true, email: true, role: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.count({ where: { role: 'inspector', status: 'pending' } }),
  ]);
  res.json({ data, pagination: { total, page, limit, totalPages: Math.ceil(total / limit), hasNext: page * limit < total, hasPrev: page > 1 } });
}));

/**
 * @swagger
 * /api/users/{id}/approve:
 *   post:
 *     summary: Approve a pending inspector (Admin only)
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 */
router.post('/:id/approve', authenticate, authorize(ROLES.ADMIN), asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) throw { status: 404, message: 'User not found' };
  if (user.status !== 'pending') throw { status: 400, message: 'User is not in pending status' };

  await prisma.user.update({ where: { id: user.id }, data: { status: 'active' } });
  const tpl = templates.inspectorApproved(`${user.firstName} ${user.lastName}`);
  await sendMail({ to: user.email, ...tpl });
  await createNotification(user.id, 'inspector_approved', 'Account Approved', 'Your inspector account has been approved. You can now login.', {});
  res.json({ message: `${user.firstName} ${user.lastName} approved successfully` });
}));

/**
 * @swagger
 * /api/users/{id}/reject:
 *   post:
 *     summary: Reject a pending inspector (Admin only)
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 */
router.post('/:id/reject', authenticate, authorize(ROLES.ADMIN), asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) throw { status: 404, message: 'User not found' };

  await prisma.user.update({ where: { id: user.id }, data: { status: 'suspended' } });
  const tpl = templates.inspectorRejected(`${user.firstName} ${user.lastName}`, reason);
  await sendMail({ to: user.email, ...tpl });
  res.json({ message: `${user.firstName} ${user.lastName} registration declined` });
}));

// ─── ADMIN USER CRUD ─────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: List all users (Admin only)
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: role
 *         schema: { type: string, enum: [admin, inspector, user] }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [active, pending, suspended] }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 */
router.get('/', authenticate, authorize(ROLES.ADMIN), asyncHandler(async (req, res) => {
  const { page, limit, skip, take } = parsePagination(req.query);
  const { role, status, search } = req.query;

  const where = {
    ...(role && { role }),
    ...(status && { status }),
    ...(search && {
      OR: [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName:  { contains: search, mode: 'insensitive' } },
        { email:     { contains: search, mode: 'insensitive' } },
      ],
    }),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where, skip, take,
      select: { id: true, firstName: true, lastName: true, email: true, role: true, status: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.count({ where }),
  ]);

  res.json({ data: users, pagination: { total, page, limit, totalPages: Math.ceil(total / limit), hasNext: page * limit < total, hasPrev: page > 1 } });
}));

router.get('/:id', authenticate, authorize(ROLES.ADMIN), asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: { id: true, firstName: true, lastName: true, email: true, role: true, status: true, createdAt: true, updatedAt: true },
  });
  if (!user) throw { status: 404, message: 'User not found' };
  res.json(user);
}));

router.put('/:id', authenticate, authorize(ROLES.ADMIN), asyncHandler(async (req, res) => {
  const { firstName, lastName, role, status } = req.body;
  if (!firstName && !lastName && !role && !status) throw { status: 400, message: 'Provide at least one field to update' };
  if (role && !VALID_ROLES.includes(role))     throw { status: 400, message: `role must be one of: ${VALID_ROLES.join(', ')}` };
  if (status && !VALID_STATUSES.includes(status)) throw { status: 400, message: `status must be one of: ${VALID_STATUSES.join(', ')}` };

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: {
      ...(firstName && { firstName: firstName.trim() }),
      ...(lastName && { lastName: lastName.trim() }),
      ...(role && { role }),
      ...(status && { status }),
    },
    select: { id: true, firstName: true, lastName: true, email: true, role: true, status: true, updatedAt: true },
  });
  res.json({ message: 'User updated', user });
}));

router.delete('/:id', authenticate, authorize(ROLES.ADMIN), asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) throw { status: 400, message: 'Cannot delete your own account' };
  await prisma.user.delete({ where: { id: req.params.id } });
  res.json({ message: 'User deleted successfully' });
}));

module.exports = router;
