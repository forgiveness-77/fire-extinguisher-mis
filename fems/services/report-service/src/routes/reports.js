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
 * tags:
 *   name: Reports
 *   description: Real-time reports and data exports (PDF/CSV)
 */

/**
 * @swagger
 * /api/reports/summary:
 *   get:
 *     summary: Live system dashboard counters
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/summary', authenticate, asyncHandler(async (req, res) => {
  const now = new Date();
  const thirtyDays = new Date(now.getTime() + 30 * 86400000);

  const [allExt, totalUsers, totalInsp, scheduledInsp, completedInsp, cancelledInsp, pendingInsp, totalMaint] = await Promise.all([
    prisma.extinguisher.findMany(),
    prisma.user.count(),
    prisma.inspection.count(),
    prisma.inspection.count({ where: { status: 'confirmed' } }),
    prisma.inspection.count({ where: { status: 'completed' } }),
    prisma.inspection.count({ where: { status: 'cancelled' } }),
    prisma.inspection.count({ where: { status: 'pending' } }),
    prisma.maintenanceLog.count(),
  ]);

  const active   = allExt.filter(e => new Date(e.expiryDate) >= now && e.assignedUserId).length;
  const inactive = allExt.filter(e => new Date(e.expiryDate) >= now && !e.assignedUserId).length;
  const expired  = allExt.filter(e => new Date(e.expiryDate) < now).length;
  const expiringSoon = allExt.filter(e => new Date(e.expiryDate) >= now && new Date(e.expiryDate) <= thirtyDays).length;

  const pendingInspectors = await prisma.user.count({ where: { role: 'inspector', status: 'pending' } });

  res.json({
    extinguishers: { total: allExt.length, active, inactive, expired, expiringSoon },
    inspections:   { total: totalInsp, pending: pendingInsp, confirmed: scheduledInsp, completed: completedInsp, cancelled: cancelledInsp },
    maintenance:   { total: totalMaint },
    users:         { total: totalUsers, pendingInspectors },
    generatedAt:   now.toISOString(),
  });
}));

/**
 * @swagger
 * /api/reports/extinguishers:
 *   get:
 *     summary: Extinguisher stock report grouped by period
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: period
 *         schema: { type: string, enum: [daily, monthly, yearly], default: yearly }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [active, inactive, expired] }
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
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

/**
 * @swagger
 * /api/reports/inspections:
 *   get:
 *     summary: Inspection status report
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
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
  res.json({ summary: { total: all.length, byStatus, upcoming: all.filter(i => i.status === 'pending' && new Date(i.scheduledDate) >= new Date()).length }, data, pagination: { total, page, limit, totalPages: Math.ceil(total/limit), hasNext: page*limit<total, hasPrev: page>1 }, generatedAt: new Date().toISOString() });
}));

/**
 * @swagger
 * /api/reports/expired:
 *   get:
 *     summary: Expired and expiring extinguishers
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: within
 *         schema: { type: integer, default: 30 }
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
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

/**
 * @swagger
 * /api/reports/maintenance-history:
 *   get:
 *     summary: Maintenance history
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
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
 *         name: period
 *         schema: { type: string, enum: [daily, monthly, yearly], default: monthly }
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
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

// ─── PDF EXPORT (fixed with bufferPages: true) ────────────────────────────────
/**
 * @swagger
 * /api/reports/export/pdf:
 *   get:
 *     summary: Export report as PDF (Admin / Inspector)
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: type
 *         required: true
 *         schema: { type: string, enum: [extinguishers, inspections, expired, maintenance] }
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
    drawHeader(['ID (short)', 'Ext. (short)', 'Inspector', 'Date', 'Actions', 'Conditions']);
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

// ─── CSV EXPORT ───────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/reports/export/csv:
 *   get:
 *     summary: Export data as CSV (Admin only)
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: type
 *         required: true
 *         schema: { type: string, enum: [extinguishers, inspections, expired, maintenance, users] }
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
    rows = data.map(i => ({ ...i, scheduledDate: i.scheduledDate.toISOString().split('T')[0], notifyEmails: undefined, createdAt: i.createdAt.toISOString() }));
  } else if (type === 'expired') {
    headers = ['id','serialNumber','location','type','size','expiryDate','assignedUserId'];
    const data = await prisma.extinguisher.findMany({ where: { expiryDate: { lte: new Date() } }, orderBy: { expiryDate: 'asc' } });
    rows = data.map(e => ({ ...e, expiryDate: e.expiryDate.toISOString().split('T')[0] }));
  } else if (type === 'maintenance') {
    headers = ['id','extinguisherId','inspectorId','actionsTaken','dateOfAction','conditionsNoted','createdAt'];
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
