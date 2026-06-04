const router = require('express').Router();
const PDFDocument  = require('pdfkit');
const { format }   = require('@fast-csv/format');
const { PrismaClient } = require('@prisma/client');
const { authenticate, authorize, ROLES } = require('../middleware/auth');
const { parsePagination, asyncHandler } = require('../middleware/validate');

const prisma = new PrismaClient();

const VALID_PERIODS = ['daily','monthly','yearly'];
const VALID_EXPORT  = ['extinguishers','inspections','expired','maintenance','users'];
const VALID_PDF     = ['extinguishers','inspections','expired','maintenance'];

// ── Status is computed (no stored field) ──────────────────────────────────────
function computeStatus(ext) {
  if (new Date(ext.expiryDate) < new Date()) return 'expired';
  return ext.assignedUserId ? 'active' : 'inactive';
}

function groupByPeriod(records, field, period) {
  const counts = {};
  for (const r of records) {
    const d = new Date(r[field]);
    let key;
    if (period === 'daily')   key = d.toISOString().split('T')[0];
    else if (period === 'monthly') key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    else key = String(d.getFullYear());
    counts[key] = (counts[key]||0) + 1;
  }
  return Object.entries(counts).sort(([a],[b]) => a.localeCompare(b)).map(([period,count]) => ({ period, count }));
}

function validateDateRange(from, to) {
  if (from && isNaN(new Date(from).getTime())) throw { status: 400, message: 'from must be a valid date' };
  if (to   && isNaN(new Date(to).getTime()))   throw { status: 400, message: 'to must be a valid date' };
  if (from && to && new Date(from) > new Date(to)) throw { status: 400, message: 'from must be before to' };
}

/**
 * @swagger
 * components:
 *   schemas:
 *     Error:
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *           example: "A descriptive error message"
 *     PeriodCount:
 *       type: object
 *       properties:
 *         period:
 *           type: string
 *           example: "2026"
 *         count:
 *           type: integer
 *           example: 12
 */

/**
 * @swagger
 * tags:
 *   name: Reports
 *   description: |
 *     Real-time system reports and data exports.
 *     **PDF export** — Admin or Inspector.  **CSV export** — Admin only.
 *     All report endpoints require authentication. No new data is created.
 */

// ─── GET /summary ─────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/reports/summary:
 *   get:
 *     summary: Live system dashboard counters
 *     description: |
 *       Returns a real-time snapshot of the entire system. Includes extinguisher status breakdown,
 *       inspection counts, maintenance activity, compliance figures, and user counts.
 *       Used to drive the main dashboard.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: System-wide summary counters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 extinguishers:
 *                   type: object
 *                   properties:
 *                     total:       { type: integer, example: 50 }
 *                     active:      { type: integer, example: 30, description: "Assigned and not expired" }
 *                     inactive:    { type: integer, example: 15, description: "Unassigned and not expired" }
 *                     expired:     { type: integer, example: 5 }
 *                     expiringSoon: { type: integer, example: 3, description: "Expire within 30 days" }
 *                 inspections:
 *                   type: object
 *                   properties:
 *                     total:     { type: integer, example: 120 }
 *                     scheduled: { type: integer, example: 20 }
 *                     confirmed: { type: integer, example: 10 }
 *                     completed: { type: integer, example: 85 }
 *                     cancelled: { type: integer, example: 5 }
 *                     overdue:   { type: integer, example: 2, description: "Past due date but not completed/cancelled" }
 *                 maintenance:
 *                   type: object
 *                   properties:
 *                     total:          { type: integer, example: 200 }
 *                     lastThirtyDays: { type: integer, example: 12 }
 *                 compliance:
 *                   type: object
 *                   properties:
 *                     expired:            { type: integer, example: 5 }
 *                     expiringSoon:       { type: integer, example: 3 }
 *                     overdueInspections: { type: integer, example: 2 }
 *                     compliant:          { type: integer, example: 42, description: "Total extinguishers minus expired and expiring" }
 *                 users:
 *                   type: object
 *                   properties:
 *                     total:            { type: integer, example: 25 }
 *                     pendingInspectors: { type: integer, example: 1 }
 *                 generatedAt:
 *                   type: string
 *                   format: date-time
 *                   example: "2026-06-03T10:30:00.000Z"
 *             example:
 *               extinguishers: { total: 50, active: 30, inactive: 15, expired: 5, expiringSoon: 3 }
 *               inspections: { total: 120, scheduled: 20, confirmed: 10, completed: 85, cancelled: 5, overdue: 2 }
 *               maintenance: { total: 200, lastThirtyDays: 12 }
 *               compliance: { expired: 5, expiringSoon: 3, overdueInspections: 2, compliant: 42 }
 *               users: { total: 25, pendingInspectors: 1 }
 *               generatedAt: "2026-06-03T10:30:00.000Z"
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/summary', authenticate, asyncHandler(async (req, res) => {
  const now = new Date();
  const thirtyDays = new Date(now.getTime() + 30 * 86400000);

  const [allExt, totalUsers, totalInsp, confirmedInsp, completedInsp, cancelledInsp, scheduledInsp, overdueInsp, totalMaint, recentMaint] = await Promise.all([
    prisma.extinguisher.findMany(),
    prisma.user.count(),
    prisma.inspection.count(),
    prisma.inspection.count({ where: { status: 'confirmed' } }),
    prisma.inspection.count({ where: { status: 'completed' } }),
    prisma.inspection.count({ where: { status: 'cancelled' } }),
    prisma.inspection.count({ where: { status: { in: ['scheduled', 'pending'] } } }),
    prisma.inspection.count({ where: { status: { in: ['scheduled', 'pending', 'confirmed'] }, scheduledDate: { lt: now } } }),
    prisma.maintenanceLog.count(),
    prisma.maintenanceLog.count({ where: { dateOfAction: { gte: new Date(now.getTime() - 30 * 86400000) } } }),
  ]);

  const active   = allExt.filter(e => new Date(e.expiryDate) >= now && e.assignedUserId).length;
  const inactive = allExt.filter(e => new Date(e.expiryDate) >= now && !e.assignedUserId).length;
  const expired  = allExt.filter(e => new Date(e.expiryDate) < now).length;
  const expiringSoon = allExt.filter(e => new Date(e.expiryDate) >= now && new Date(e.expiryDate) <= thirtyDays).length;

  const pendingInspectors = await prisma.user.count({ where: { role: 'inspector', status: 'pending' } });

  res.json({
    extinguishers: { total: allExt.length, active, inactive, expired, expiringSoon },
    inspections:   { total: totalInsp, scheduled: scheduledInsp, confirmed: confirmedInsp, completed: completedInsp, cancelled: cancelledInsp, overdue: overdueInsp },
    maintenance:   { total: totalMaint, lastThirtyDays: recentMaint },
    compliance:    { expired, expiringSoon, overdueInspections: overdueInsp, compliant: allExt.length - expired - expiringSoon },
    users:         { total: totalUsers, pendingInspectors },
    generatedAt:   now.toISOString(),
  });
}));

// ─── GET /extinguishers ───────────────────────────────────────────────────────
/**
 * @swagger
 * /api/reports/extinguishers:
 *   get:
 *     summary: Extinguisher stock report grouped by registration period
 *     description: |
 *       Returns a stock report with summary counts broken down by type and status,
 *       a time-series of registration counts grouped by `period`, and a paginated
 *       record list for drilling down. Optionally filter by computed status.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [daily, monthly, yearly]
 *           default: yearly
 *         description: Time grouping for the registration trend chart
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive, expired]
 *         description: Filter records by computed status
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
 *     responses:
 *       200:
 *         description: Extinguisher stock report
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 summary:
 *                   type: object
 *                   properties:
 *                     total:    { type: integer, example: 50 }
 *                     byType:
 *                       type: object
 *                       example: { CO2: 20, Water: 15, Foam: 10, DryChemical: 5 }
 *                     byStatus:
 *                       type: object
 *                       example: { active: 30, inactive: 15, expired: 5 }
 *                 grouped:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PeriodCount'
 *                   example: [{ period: "2024", count: 12 }, { period: "2025", count: 20 }]
 *                 period:
 *                   type: string
 *                   example: yearly
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: Extinguisher with computed status field
 *                 pagination:
 *                   type: object
 *                 generatedAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Invalid period value
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               value: { error: "period must be one of: daily, monthly, yearly" }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/extinguishers', authenticate, asyncHandler(async (req, res) => {
  const { period = 'yearly', status } = req.query;
  const { page, limit, skip, take } = parsePagination(req.query);
  if (!VALID_PERIODS.includes(period)) throw { status: 400, message: `period must be one of: ${VALID_PERIODS.join(', ')}` };

  const now = new Date();
  const baseWhere = {};
  if (status === 'expired')  { baseWhere.expiryDate = { lt: now }; }
  else if (status === 'active')   { baseWhere.expiryDate = { gte: now }; baseWhere.assignedUserId = { not: null }; }
  else if (status === 'inactive') { baseWhere.expiryDate = { gte: now }; baseWhere.assignedUserId = null; }

  const [all, data, total] = await Promise.all([
    prisma.extinguisher.findMany({ where: baseWhere, orderBy: { createdAt: 'asc' } }),
    prisma.extinguisher.findMany({ where: baseWhere, skip, take, orderBy: { createdAt: 'desc' } }),
    prisma.extinguisher.count({ where: baseWhere }),
  ]);

  const byType   = all.reduce((a,e) => { a[e.type] = (a[e.type]||0)+1; return a; }, {});
  const byStatus = all.reduce((a,e) => { const s = computeStatus(e); a[s] = (a[s]||0)+1; return a; }, {});
  const grouped  = groupByPeriod(all, 'createdAt', period);

  res.json({ summary: { total, byType, byStatus }, grouped, period, data: data.map(e => ({ ...e, status: computeStatus(e) })), pagination: { total, page, limit, totalPages: Math.ceil(total/limit), hasNext: page*limit<total, hasPrev: page>1 }, generatedAt: new Date().toISOString() });
}));

// ─── GET /inspections ─────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/reports/inspections:
 *   get:
 *     summary: Inspection status report with date range filtering
 *     description: Returns inspection counts broken down by status, upcoming count, and a paginated record list. Optionally filter by date range.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *         description: Start of date range for scheduledDate
 *         example: "2026-01-01"
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *         description: End of date range for scheduledDate
 *         example: "2026-12-31"
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
 *     responses:
 *       200:
 *         description: Inspection report
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 summary:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                       example: 120
 *                     byStatus:
 *                       type: object
 *                       example: { scheduled: 20, confirmed: 10, completed: 85, cancelled: 5 }
 *                     upcoming:
 *                       type: integer
 *                       description: Future inspections in scheduled or confirmed status
 *                       example: 8
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                 pagination:
 *                   type: object
 *                 generatedAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Invalid date range
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
router.get('/inspections', authenticate, asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const { page, limit, skip, take } = parsePagination(req.query);
  validateDateRange(from, to);
  const where = (from||to) ? { scheduledDate: { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) } } : {};
  const [all, data, total] = await Promise.all([
    prisma.inspection.findMany({ where }),
    prisma.inspection.findMany({ where, skip, take, orderBy: { scheduledDate: 'desc' } }),
    prisma.inspection.count({ where }),
  ]);
  const byStatus = all.reduce((a,i) => { a[i.status]=(a[i.status]||0)+1; return a; }, {});
  res.json({ summary: { total: all.length, byStatus, upcoming: all.filter(i => ['scheduled','pending'].includes(i.status) && new Date(i.scheduledDate) >= new Date()).length }, data, pagination: { total, page, limit, totalPages: Math.ceil(total/limit), hasNext: page*limit<total, hasPrev: page>1 }, generatedAt: new Date().toISOString() });
}));

// ─── GET /expired ─────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/reports/expired:
 *   get:
 *     summary: Expired and soon-to-expire extinguishers
 *     description: |
 *       Returns two lists:
 *       - `expired` — extinguishers whose expiry date has already passed
 *       - `expiringSoon` — extinguishers expiring within the next `within` days
 *
 *       Both lists are paginated independently using the same `page`/`limit` parameters.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: within
 *         schema:
 *           type: integer
 *           default: 30
 *           minimum: 1
 *         description: Days ahead to check for upcoming expiries
 *         example: 30
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
 *     responses:
 *       200:
 *         description: Expired and expiring extinguisher lists
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 expired:
 *                   type: object
 *                   properties:
 *                     count:
 *                       type: integer
 *                       example: 5
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         description: Extinguisher with status="expired"
 *                     pagination:
 *                       type: object
 *                 expiringSoon:
 *                   type: object
 *                   properties:
 *                     count:
 *                       type: integer
 *                       example: 3
 *                     withinDays:
 *                       type: integer
 *                       example: 30
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                     pagination:
 *                       type: object
 *                 generatedAt:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/expired', authenticate, asyncHandler(async (req, res) => {
  const within = parseInt(req.query.within, 10) || 30;
  const { page, limit, skip, take } = parsePagination(req.query);
  const now = new Date();
  const threshold = new Date(now.getTime() + within * 86400000);

  const [expired, expiring, totalExpired, totalExpiring] = await Promise.all([
    prisma.extinguisher.findMany({ where: { expiryDate: { lte: now } }, skip, take, orderBy: { expiryDate: 'asc' } }),
    prisma.extinguisher.findMany({ where: { expiryDate: { gt: now, lte: threshold } }, skip, take, orderBy: { expiryDate: 'asc' } }),
    prisma.extinguisher.count({ where: { expiryDate: { lte: now } } }),
    prisma.extinguisher.count({ where: { expiryDate: { gt: now, lte: threshold } } }),
  ]);

  const pg = (total) => ({ total, page, limit, totalPages: Math.ceil(total/limit), hasNext: page*limit<total, hasPrev: page>1 });

  res.json({
    expired:     { count: totalExpired,  data: expired.map(e => ({ ...e, status: 'expired' })),   pagination: pg(totalExpired) },
    expiringSoon:{ count: totalExpiring, withinDays: within, data: expiring.map(e => ({ ...e, status: computeStatus(e) })), pagination: pg(totalExpiring) },
    generatedAt: now.toISOString(),
  });
}));

// ─── GET /maintenance-history ─────────────────────────────────────────────────
/**
 * @swagger
 * /api/reports/maintenance-history:
 *   get:
 *     summary: Maintenance history report grouped by period
 *     description: |
 *       Returns a time-series count of maintenance activity and a paginated record list.
 *       Can be filtered to a specific extinguisher and/or date range.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: extinguisherId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter logs for a specific extinguisher
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date filter for dateOfAction
 *         example: "2026-01-01"
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *         description: End date filter for dateOfAction
 *         example: "2026-12-31"
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [daily, monthly, yearly]
 *           default: monthly
 *         description: Time grouping for the trend chart
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
 *     responses:
 *       200:
 *         description: Maintenance history report
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 summary:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                       example: 48
 *                     grouped:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/PeriodCount'
 *                       example: [{ period: "2026-01", count: 5 }, { period: "2026-02", count: 8 }]
 *                     period:
 *                       type: string
 *                       example: monthly
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                 pagination:
 *                   type: object
 *                 generatedAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Invalid period or date range
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
router.get('/maintenance-history', authenticate, asyncHandler(async (req, res) => {
  const { extinguisherId, from, to, period = 'monthly' } = req.query;
  const { page, limit, skip, take } = parsePagination(req.query);
  if (!VALID_PERIODS.includes(period)) throw { status: 400, message: `period must be one of: ${VALID_PERIODS.join(', ')}` };
  validateDateRange(from, to);
  const where = { ...(extinguisherId && { extinguisherId }), ...((from||to) && { dateOfAction: { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) } }) };
  const [all, data, total] = await Promise.all([
    prisma.maintenanceLog.findMany({ where, orderBy: { dateOfAction: 'asc' } }),
    prisma.maintenanceLog.findMany({ where, skip, take, orderBy: { dateOfAction: 'desc' } }),
    prisma.maintenanceLog.count({ where }),
  ]);
  res.json({ summary: { total: all.length, grouped: groupByPeriod(all,'dateOfAction',period), period }, data, pagination: { total, page, limit, totalPages: Math.ceil(total/limit), hasNext: page*limit<total, hasPrev: page>1 }, generatedAt: new Date().toISOString() });
}));

// ─── GET /export/pdf ──────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/reports/export/pdf:
 *   get:
 *     summary: Export report as PDF (Admin / Inspector)
 *     description: |
 *       Generates and streams a PDF report. The file is automatically downloaded by the browser.
 *       TZW LTD branded with crimson header and footer, cream row alternation, and page numbering.
 *
 *       **Available report types:**
 *       - `extinguishers` — full inventory with status
 *       - `inspections` — all inspection records
 *       - `expired` — expired extinguishers only
 *       - `maintenance` — all maintenance logs
 *
 *       > **Tip:** Click "Download file" after executing in Swagger — the browser will open the PDF.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [extinguishers, inspections, expired, maintenance]
 *         description: Type of report to generate
 *         example: extinguishers
 *     responses:
 *       200:
 *         description: PDF file stream
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *         headers:
 *           Content-Disposition:
 *             schema:
 *               type: string
 *               example: 'attachment; filename="fems-extinguishers-1717407600000.pdf"'
 *       400:
 *         description: Missing or invalid type parameter
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               value: { error: "type required: extinguishers, inspections, expired, maintenance" }
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
 */
router.get('/export/pdf', authenticate, authorize(ROLES.ADMIN, ROLES.INSPECTOR), asyncHandler(async (req, res) => {
  const { type } = req.query;
  if (!type || !VALID_PDF.includes(type)) throw { status: 400, message: `type required: ${VALID_PDF.join(', ')}` };

  // bufferPages: true is REQUIRED for switchToPage and footer rendering
  const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="fems-${type}-${Date.now()}.pdf"`);
  doc.pipe(res);

  const CRIMSON = '#DC143C';
  const CREAM   = '#FFF8F0';

  // Header
  doc.rect(0, 0, doc.page.width, 72).fill(CRIMSON);
  doc.fillColor('white').fontSize(20).font('Helvetica-Bold').text('TZW LTD', 40, 16);
  doc.fontSize(10).font('Helvetica').text('Fire Extinguisher Management System', 40, 42);
  doc.fillColor(CRIMSON).fontSize(13).font('Helvetica-Bold').text(`${type.toUpperCase()} REPORT`, 40, 84);
  doc.fillColor('#666').fontSize(9).font('Helvetica').text(`Generated: ${new Date().toLocaleString()}  |  By: ${req.user.firstName} ${req.user.lastName}`, 40, 101);
  doc.moveTo(40, 117).lineTo(doc.page.width - 40, 117).strokeColor('#fecdd3').lineWidth(1).stroke();
  doc.moveDown(2);

  const COL_W = [50, 110, 110, 85, 65, 75];
  const TBL_LEFT = 40;
  const TBL_W    = COL_W.reduce((s,w)=>s+w, 0);
  const ROW_H    = 18;
  const HEAD_H   = 20;

  function drawHeader(cols) {
    const y = doc.y;
    doc.rect(TBL_LEFT, y, TBL_W, HEAD_H).fill(CRIMSON).stroke();
    let x = TBL_LEFT;
    cols.forEach((c, i) => {
      doc.fillColor('white').font('Helvetica-Bold').fontSize(8)
        .text(c, x+3, y+5, { width: COL_W[i]-6, ellipsis: true, lineBreak: false });
      x += COL_W[i];
    });
    doc.y = y + HEAD_H + 2;
  }

  function drawRow(cells, rowIdx) {
    if (doc.y > doc.page.height - 60) {
      doc.addPage();
      doc.y = 40;
    }
    const y = doc.y;
    if (rowIdx % 2 === 0) doc.rect(TBL_LEFT, y, TBL_W, ROW_H).fill(CREAM).stroke();
    let x = TBL_LEFT;
    cells.forEach((cell, i) => {
      doc.fillColor('#222').font('Helvetica').fontSize(8)
        .text(String(cell ?? '—'), x+3, y+4, { width: COL_W[i]-6, ellipsis: true, lineBreak: false });
      x += COL_W[i];
    });
    doc.y = y + ROW_H;
  }

  function sectionTitle(txt) {
    doc.fillColor('#222').font('Helvetica-Bold').fontSize(11).text(txt);
    doc.moveDown(0.3);
  }

  if (type === 'extinguishers') {
    const data = await prisma.extinguisher.findMany({ orderBy: { createdAt: 'desc' } });
    sectionTitle(`Total extinguishers: ${data.length}`);
    drawHeader(['ID (short)', 'Serial No.', 'Location', 'Type', 'Status', 'Expiry']);
    data.forEach((e, i) => drawRow([e.id.slice(0,8)+'…', e.serialNumber, e.location, e.type, computeStatus(e), e.expiryDate.toISOString().split('T')[0]], i));
  } else if (type === 'inspections') {
    const data = await prisma.inspection.findMany({ orderBy: { scheduledDate: 'desc' } });
    sectionTitle(`Total inspections: ${data.length}`);
    drawHeader(['ID (short)', 'Ext. (short)', 'Scheduled By', 'Date', 'Time', 'Status']);
    data.forEach((i, idx) => drawRow([i.id.slice(0,8)+'…', i.extinguisherId.slice(0,8)+'…', i.scheduledById.slice(0,8)+'…', i.scheduledDate.toISOString().split('T')[0], i.scheduledTime, i.status], idx));
  } else if (type === 'expired') {
    const data = await prisma.extinguisher.findMany({ where: { expiryDate: { lte: new Date() } }, orderBy: { expiryDate: 'asc' } });
    sectionTitle(`Expired extinguishers: ${data.length}`);
    drawHeader(['ID (short)', 'Serial No.', 'Location', 'Type', 'Expiry Date', 'Status']);
    data.forEach((e, i) => drawRow([e.id.slice(0,8)+'…', e.serialNumber, e.location, e.type, e.expiryDate.toISOString().split('T')[0], 'expired'], i));
  } else if (type === 'maintenance') {
    const data = await prisma.maintenanceLog.findMany({ orderBy: { dateOfAction: 'desc' } });
    sectionTitle(`Maintenance logs: ${data.length}`);
    drawHeader(['ID (short)', 'Ext. (short)', 'Inspector', 'Date', 'Actions', 'Issues']);
    data.forEach((m, i) => drawRow([m.id.slice(0,8)+'…', m.extinguisherId.slice(0,8)+'…', m.inspectorId.slice(0,8)+'…', m.dateOfAction.toISOString().split('T')[0], m.actionsTaken, m.conditionsNoted], i));
  }

  // Footer on every page (requires bufferPages: true)
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.rect(0, doc.page.height - 28, doc.page.width, 28).fill(CRIMSON);
    doc.fillColor('white').fontSize(8).font('Helvetica')
      .text(`TZW LTD – Confidential  |  Page ${i+1} of ${range.count}`, 0, doc.page.height - 18, { align: 'center', width: doc.page.width });
  }

  doc.end();
}));

// ─── GET /export/csv ──────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/reports/export/csv:
 *   get:
 *     summary: Export data as CSV (Admin only)
 *     description: |
 *       Streams a CSV file download. Includes a header row.
 *       The `users` type is only available here (not in PDF export).
 *
 *       **CSV columns by type:**
 *       - `extinguishers` — id, serialNumber, location, type, size, installationDate, expiryDate, status, assignedUserId, createdAt
 *       - `inspections` — id, extinguisherId, scheduledById, inspectorId, scheduledDate, scheduledTime, status, notes, createdAt
 *       - `expired` — id, serialNumber, location, type, size, expiryDate, assignedUserId
 *       - `maintenance` — id, extinguisherId, inspectorId, actionsTaken, dateOfAction, conditionsNoted, notes, createdAt
 *       - `users` — id, firstName, lastName, email, role, status, createdAt
 *
 *       > **Tip:** Click "Download file" after executing in Swagger to get the CSV.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [extinguishers, inspections, expired, maintenance, users]
 *         description: Dataset to export
 *         example: extinguishers
 *     responses:
 *       200:
 *         description: CSV file stream
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 *         headers:
 *           Content-Disposition:
 *             schema:
 *               type: string
 *               example: 'attachment; filename="fems-extinguishers-2026-06-03.csv"'
 *       400:
 *         description: Missing or invalid type parameter
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               value: { error: "type required: extinguishers, inspections, expired, maintenance, users" }
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
router.get('/export/csv', authenticate, authorize(ROLES.ADMIN), asyncHandler(async (req, res) => {
  const { type } = req.query;
  if (!type || !VALID_EXPORT.includes(type)) throw { status: 400, message: `type required: ${VALID_EXPORT.join(', ')}` };

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="fems-${type}-${new Date().toISOString().split('T')[0]}.csv"`);

  let headers = [];
  let rows    = [];

  if (type === 'extinguishers') {
    headers = ['id','serialNumber','location','type','size','installationDate','expiryDate','status','assignedUserId','createdAt'];
    const data = await prisma.extinguisher.findMany({ orderBy: { createdAt: 'desc' } });
    rows = data.map(e => ({ ...e, status: computeStatus(e), installationDate: e.installationDate.toISOString().split('T')[0], expiryDate: e.expiryDate.toISOString().split('T')[0], createdAt: e.createdAt.toISOString() }));
  } else if (type === 'inspections') {
    headers = ['id','extinguisherId','scheduledById','inspectorId','scheduledDate','scheduledTime','status','notes','createdAt'];
    const data = await prisma.inspection.findMany({ orderBy: { scheduledDate: 'desc' } });
    rows = data.map(i => ({ ...i, scheduledDate: i.scheduledDate.toISOString().split('T')[0], notifyPersonnel: undefined, createdAt: i.createdAt.toISOString() }));
  } else if (type === 'expired') {
    headers = ['id','serialNumber','location','type','size','expiryDate','assignedUserId'];
    const data = await prisma.extinguisher.findMany({ where: { expiryDate: { lte: new Date() } }, orderBy: { expiryDate: 'asc' } });
    rows = data.map(e => ({ ...e, expiryDate: e.expiryDate.toISOString().split('T')[0] }));
  } else if (type === 'maintenance') {
    headers = ['id','extinguisherId','inspectorId','actionsTaken','dateOfAction','conditionsNoted','notes','createdAt'];
    const data = await prisma.maintenanceLog.findMany({ orderBy: { dateOfAction: 'desc' } });
    rows = data.map(m => ({ ...m, dateOfAction: m.dateOfAction.toISOString().split('T')[0], createdAt: m.createdAt.toISOString() }));
  } else if (type === 'users') {
    headers = ['id','firstName','lastName','email','role','status','createdAt'];
    const data = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
    rows = data.map(u => ({ id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email, role: u.role, status: u.status, createdAt: u.createdAt.toISOString() }));
  }

  const csvStream = format({ headers });
  csvStream.pipe(res);
  rows.forEach(r => { const row = {}; headers.forEach(h => { row[h] = r[h] ?? ''; }); csvStream.write(row); });
  csvStream.end();
}));

module.exports = router;
