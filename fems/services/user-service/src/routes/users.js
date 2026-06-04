const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { authenticate, authorize, ROLES } = require('../middleware/auth');
const { parsePagination, parseId, asyncHandler } = require('../middleware/validate');
const { sendMail, templates } = require('../mailer');

const prisma = new PrismaClient();
const VALID_ROLES    = ['admin', 'inspector', 'user'];
const VALID_STATUSES = ['active', 'pending', 'suspended'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function createNotification(userId, type, title, message, metadata) {
  try { await prisma.notification.create({ data: { userId, type, title, message, metadata } }); } catch {}
}
async function notifyAllAdmins(type, title, message, metadata) {
  const admins = await prisma.user.findMany({ where: { role: 'admin', status: 'active' }, select: { id: true } });
  await Promise.all(admins.map(a => createNotification(a.id, type, title, message, metadata)));
}

// ─── COMPONENT SCHEMAS ────────────────────────────────────────────────────────
/**
 * @swagger
 * components:
 *   schemas:
 *     UserResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *         firstName:
 *           type: string
 *           example: John
 *         lastName:
 *           type: string
 *           example: Doe
 *         email:
 *           type: string
 *           format: email
 *           example: john.doe@tzwltd.com
 *         role:
 *           type: string
 *           enum: [admin, inspector, user]
 *         status:
 *           type: string
 *           enum: [active, pending, suspended]
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
 *     AuthToken:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: Login successful
 *         token:
 *           type: string
 *           description: JWT bearer token — include in Authorization header for all protected routes
 *           example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *         user:
 *           $ref: '#/components/schemas/UserResponse'
 */

/**
 * @swagger
 * tags:
 *   - name: Auth
 *     description: Registration, login and password management
 *   - name: Users
 *     description: User profile and admin CRUD operations
 */

// ─── REGISTER ─────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/users/register:
 *   post:
 *     summary: Register a new user account
 *     description: |
 *       Creates a new user. Inspectors start with `status=pending` and must be approved by an admin before they can log in.
 *       Admins and regular users are immediately `active`.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [firstName, lastName, email, password, role]
 *             properties:
 *               firstName:
 *                 type: string
 *                 example: John
 *               lastName:
 *                 type: string
 *                 example: Doe
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john.doe@tzwltd.com
 *               password:
 *                 type: string
 *                 minLength: 6
 *                 example: "SecurePass@1"
 *               role:
 *                 type: string
 *                 enum: [admin, inspector, user]
 *                 example: inspector
 *           examples:
 *             admin:
 *               summary: Register admin
 *               value: { firstName: "Alice", lastName: "Admin", email: "alice@tzwltd.com", password: "Admin@123", role: "admin" }
 *             inspector:
 *               summary: Register inspector (starts pending)
 *               value: { firstName: "Bob", lastName: "Smith", email: "bob.smith@tzwltd.com", password: "Inspector@1", role: "inspector" }
 *             user:
 *               summary: Register regular user
 *               value: { firstName: "Carol", lastName: "User", email: "carol@tzwltd.com", password: "User@123", role: "user" }
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User registered successfully"
 *                 user:
 *                   $ref: '#/components/schemas/UserResponse'
 *       400:
 *         description: Validation error (missing fields, weak password, invalid email, invalid role)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               missingFields:
 *                 value: { error: "Missing required fields: firstName, password" }
 *               weakPassword:
 *                 value: { error: "Password must be at least 6 characters" }
 *               invalidRole:
 *                 value: { error: "role must be one of: admin, inspector, user" }
 *       409:
 *         description: Email already registered
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               value: { error: "Email already registered" }
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

  const status = role === 'inspector' ? 'pending' : 'active';
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { firstName: firstName.trim(), lastName: lastName.trim(), email: email.toLowerCase(), passwordHash, role, status },
    select: { id: true, firstName: true, lastName: true, email: true, role: true, status: true, createdAt: true },
  });

  if (role === 'inspector') {
    const tpl = templates.inspectorPending(`${firstName} ${lastName}`);
    await sendMail({ to: email, ...tpl });
    const adminTpl = templates.adminNewInspector(`${firstName} ${lastName}`, email);
    const admins = await prisma.user.findMany({ where: { role: 'admin', status: 'active' }, select: { email: true } });
    if (admins.length) await sendMail({ to: admins.map(a => a.email), ...adminTpl });
    await notifyAllAdmins('inspector_pending', 'New Inspector Pending', `${firstName} ${lastName} (${email}) registered as inspector and awaits approval.`, { userId: user.id, email });
  }

  res.status(201).json({
    message: role === 'inspector'
      ? 'Registration received. Please wait for admin approval before logging in.'
      : 'User registered successfully',
    user,
  });
}));

// ─── LOGIN ────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/users/login:
 *   post:
 *     summary: Login and receive a JWT token
 *     description: |
 *       Returns a JWT bearer token valid for 24 hours. Include it in all subsequent requests:
 *       `Authorization: Bearer <token>`
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: admin@tzwltd.com
 *               password:
 *                 type: string
 *                 example: "Admin@123"
 *           examples:
 *             admin:
 *               summary: Login as admin
 *               value: { email: "admin@tzwltd.com", password: "Admin@123" }
 *             inspector:
 *               summary: Login as inspector
 *               value: { email: "inspector@tzwltd.com", password: "Inspect@123" }
 *             user:
 *               summary: Login as user
 *               value: { email: "user@tzwltd.com", password: "User@123" }
 *     responses:
 *       200:
 *         description: Login successful — copy the `token` value and click Authorize (🔓) in Swagger
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthToken'
 *       400:
 *         description: Missing email or password
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Invalid email or password
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               value: { error: "Invalid credentials" }
 *       403:
 *         description: Account is pending approval or suspended
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               pending:
 *                 value: { error: "Account pending admin approval. Check your email for updates." }
 *               suspended:
 *                 value: { error: "Account suspended. Contact the system administrator." }
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

// ─── PROFILE ──────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/users/profile:
 *   get:
 *     summary: Get my profile
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user's profile
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserResponse'
 *       401:
 *         description: Missing or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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
 *     summary: Update my profile (firstName and/or lastName)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *                 example: Jonathan
 *               lastName:
 *                 type: string
 *                 example: Smith
 *           example:
 *             firstName: "Jonathan"
 *             lastName: "Smith"
 *     responses:
 *       200:
 *         description: Profile updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Profile updated
 *                 user:
 *                   $ref: '#/components/schemas/UserResponse'
 *       400:
 *         description: No fields provided to update
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

// ─── CHANGE PASSWORD ──────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/users/change-password:
 *   put:
 *     summary: Change my password
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 description: Your current password
 *                 example: "Admin@123"
 *               newPassword:
 *                 type: string
 *                 minLength: 6
 *                 description: New password (min 6 characters, must differ from current)
 *                 example: "NewAdmin@456"
 *     responses:
 *       200:
 *         description: Password changed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Password changed successfully
 *       400:
 *         description: Validation error or current password incorrect
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               missingFields:
 *                 value: { error: "currentPassword and newPassword required" }
 *               wrongCurrent:
 *                 value: { error: "Current password is incorrect" }
 *               samePassword:
 *                 value: { error: "New password must differ from current" }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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

// ─── RECOVER PASSWORD ─────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/users/recover-password:
 *   post:
 *     summary: Request a password reset token
 *     description: |
 *       Sends a reset token to the provided email (if it exists). Always returns 200 to prevent email enumeration.
 *       Use the token in `POST /api/users/reset-password`.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: admin@tzwltd.com
 *     responses:
 *       200:
 *         description: Always returns 200 (check email/server logs for token)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "If that email exists, a reset token has been sent."
 *       400:
 *         description: Missing email field
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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

// ─── RESET PASSWORD ───────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/users/reset-password:
 *   post:
 *     summary: Reset password using the token received by email
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, newPassword]
 *             properties:
 *               token:
 *                 type: string
 *                 description: 64-character hex token from the recovery email / server log
 *                 example: "a3f9e1b2c4d5..."
 *               newPassword:
 *                 type: string
 *                 minLength: 6
 *                 example: "ResetPass@789"
 *     responses:
 *       200:
 *         description: Password reset — login with your new password
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Password reset successfully. Please login."
 *       400:
 *         description: Missing fields, weak password, or invalid/expired token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               missingFields:
 *                 value: { error: "token and newPassword required" }
 *               badToken:
 *                 value: { error: "Invalid or expired reset token" }
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

// ─── PENDING INSPECTORS ───────────────────────────────────────────────────────
/**
 * @swagger
 * /api/users/pending:
 *   get:
 *     summary: List pending inspector registrations awaiting approval (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Paginated list of pending inspectors
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/UserResponse'
 *                 pagination:
 *                   $ref: '#/components/schemas/PaginationMeta'
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

// ─── APPROVE INSPECTOR ────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/users/{id}/approve:
 *   post:
 *     summary: Approve a pending inspector account (Admin only)
 *     description: Sets the inspector's status to `active`. An approval email is sent automatically.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: UUID of the inspector to approve
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Inspector approved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Bob Smith approved successfully"
 *       400:
 *         description: User is not in pending status
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               value: { error: "User is not in pending status" }
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
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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

// ─── REJECT INSPECTOR ─────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/users/{id}/reject:
 *   post:
 *     summary: Reject a pending inspector registration (Admin only)
 *     description: Sets the user's status to `suspended`. A rejection email is sent with the optional reason.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: UUID of the inspector to reject
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Optional rejection reason (included in the email)
 *                 example: "Incomplete documentation provided"
 *     responses:
 *       200:
 *         description: Inspector registration rejected
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Bob Smith registration declined"
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
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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

// ─── LIST ALL USERS ───────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: List all users with filters and pagination (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [admin, inspector, user]
 *         description: Filter by role
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, pending, suspended]
 *         description: Filter by account status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Case-insensitive search on firstName, lastName or email
 *         example: "john"
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
 *         description: Paginated list of users
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/UserResponse'
 *                 pagination:
 *                   $ref: '#/components/schemas/PaginationMeta'
 *       400:
 *         description: Invalid pagination parameters
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
 *       403:
 *         description: Admin role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', authenticate, authorize(ROLES.ADMIN), asyncHandler(async (req, res) => {
  const { page, limit, skip, take } = parsePagination(req.query);
  const { role, status, search } = req.query;
  const where = {
    ...(role && { role }),
    ...(status && { status }),
    ...(search && { OR: [
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName:  { contains: search, mode: 'insensitive' } },
      { email:     { contains: search, mode: 'insensitive' } },
    ] }),
  };
  const [users, total] = await Promise.all([
    prisma.user.findMany({ where, skip, take, select: { id: true, firstName: true, lastName: true, email: true, role: true, status: true, createdAt: true, updatedAt: true }, orderBy: { createdAt: 'desc' } }),
    prisma.user.count({ where }),
  ]);
  res.json({ data: users, pagination: { total, page, limit, totalPages: Math.ceil(total / limit), hasNext: page * limit < total, hasPrev: page > 1 } });
}));

// ─── GET USER BY ID ───────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     summary: Get a user by ID (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: UUID of the user
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: User object
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserResponse'
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
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               value: { error: "User not found" }
 */
router.get('/:id', authenticate, authorize(ROLES.ADMIN), asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: { id: true, firstName: true, lastName: true, email: true, role: true, status: true, createdAt: true, updatedAt: true },
  });
  if (!user) throw { status: 404, message: 'User not found' };
  res.json(user);
}));

// ─── UPDATE USER ──────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/users/{id}:
 *   put:
 *     summary: Update a user's details (Admin only)
 *     description: Update firstName, lastName, role and/or status. At least one field must be provided.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: UUID of the user to update
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
 *               firstName:
 *                 type: string
 *                 example: Jonathan
 *               lastName:
 *                 type: string
 *                 example: Doe
 *               role:
 *                 type: string
 *                 enum: [admin, inspector, user]
 *               status:
 *                 type: string
 *                 enum: [active, pending, suspended]
 *           examples:
 *             changeRole:
 *               summary: Promote to inspector
 *               value: { role: "inspector", status: "active" }
 *             suspend:
 *               summary: Suspend user
 *               value: { status: "suspended" }
 *     responses:
 *       200:
 *         description: User updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: User updated
 *                 user:
 *                   $ref: '#/components/schemas/UserResponse'
 *       400:
 *         description: No fields provided or invalid enum value
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
 *       403:
 *         description: Admin role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put('/:id', authenticate, authorize(ROLES.ADMIN), asyncHandler(async (req, res) => {
  const { firstName, lastName, role, status } = req.body;
  if (!firstName && !lastName && !role && !status) throw { status: 400, message: 'Provide at least one field to update' };
  if (role && !VALID_ROLES.includes(role))       throw { status: 400, message: `role must be one of: ${VALID_ROLES.join(', ')}` };
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

// ─── DELETE USER ──────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/users/{id}:
 *   delete:
 *     summary: Delete a user permanently (Admin only)
 *     description: Permanently removes the user record. You cannot delete your own account.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: UUID of the user to delete
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: User deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: User deleted successfully
 *       400:
 *         description: Attempted to delete own account
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               value: { error: "Cannot delete your own account" }
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
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete('/:id', authenticate, authorize(ROLES.ADMIN), asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) throw { status: 400, message: 'Cannot delete your own account' };
  await prisma.user.delete({ where: { id: req.params.id } });
  res.json({ message: 'User deleted successfully' });
}));

module.exports = router;
