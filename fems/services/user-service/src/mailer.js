const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (!transporter && process.env.MAIL_USER) {
    transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST || 'smtp.gmail.com',
      port: Number(process.env.MAIL_PORT || 587),
      secure: false,
      auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
      tls: { rejectUnauthorized: false },
    });
  }
  return transporter;
}

async function sendMail({ to, subject, html }) {
  const t = getTransporter();
  if (!t) {
    console.log(`[MAIL SKIP] To: ${Array.isArray(to) ? to.join(', ') : to} | ${subject}`);
    return;
  }
  try {
    await t.sendMail({
      from: `"TZW LTD FEMS" <${process.env.MAIL_FROM || process.env.MAIL_USER}>`,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      html,
    });
    console.log(`[MAIL SENT] To: ${Array.isArray(to) ? to.join(', ') : to}`);
  } catch (err) {
    console.error(`[MAIL ERROR] ${err.message}`);
  }
}

const templates = {
  inspectorPending: (name) => ({
    subject: 'TZW LTD – Account Pending Approval',
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
      <div style="background:#DC143C;padding:24px 32px"><h2 style="color:white;margin:0">TZW LTD FEMS</h2></div>
      <div style="padding:32px;background:#fff8f0;border:1px solid #fecdd3">
        <h3 style="color:#DC143C">Registration Received</h3>
        <p>Hi <strong>${name}</strong>,</p>
        <p>Your inspector account has been received and is <strong>pending approval</strong> by an administrator.</p>
        <p>You will receive an email once your account is approved. Please do not attempt to login until then.</p>
        <p style="color:#888;font-size:13px;margin-top:24px">TZW LTD Fire Extinguisher Management System</p>
      </div>
    </div>`,
  }),

  adminNewInspector: (name, email) => ({
    subject: 'TZW LTD – New Inspector Registration Pending',
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
      <div style="background:#DC143C;padding:24px 32px"><h2 style="color:white;margin:0">TZW LTD FEMS</h2></div>
      <div style="padding:32px;background:#fff8f0;border:1px solid #fecdd3">
        <h3 style="color:#DC143C">New Inspector Registration</h3>
        <p>A new inspector has registered and is awaiting your approval:</p>
        <table style="border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:4px 12px 4px 0;color:#888;font-size:13px">Name</td><td><strong>${name}</strong></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#888;font-size:13px">Email</td><td>${email}</td></tr>
        </table>
        <p>Login to FEMS to approve or reject this registration.</p>
        <p style="color:#888;font-size:13px;margin-top:24px">TZW LTD Fire Extinguisher Management System</p>
      </div>
    </div>`,
  }),

  inspectorApproved: (name) => ({
    subject: 'TZW LTD – Account Approved',
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
      <div style="background:#DC143C;padding:24px 32px"><h2 style="color:white;margin:0">TZW LTD FEMS</h2></div>
      <div style="padding:32px;background:#fff8f0;border:1px solid #fecdd3">
        <h3 style="color:#16a34a">Account Approved</h3>
        <p>Hi <strong>${name}</strong>,</p>
        <p>Your inspector account has been <strong>approved</strong>. You can now login to TZW LTD FEMS.</p>
        <p style="color:#888;font-size:13px;margin-top:24px">TZW LTD Fire Extinguisher Management System</p>
      </div>
    </div>`,
  }),

  inspectorRejected: (name, reason) => ({
    subject: 'TZW LTD – Account Registration Declined',
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
      <div style="background:#DC143C;padding:24px 32px"><h2 style="color:white;margin:0">TZW LTD FEMS</h2></div>
      <div style="padding:32px;background:#fff8f0;border:1px solid #fecdd3">
        <h3 style="color:#dc2626">Account Declined</h3>
        <p>Hi <strong>${name}</strong>,</p>
        <p>Unfortunately your inspector account registration has been <strong>declined</strong>.</p>
        ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
        <p>If you believe this is an error, please contact your system administrator.</p>
        <p style="color:#888;font-size:13px;margin-top:24px">TZW LTD Fire Extinguisher Management System</p>
      </div>
    </div>`,
  }),

  extinguisherAssigned: (name, serialNumber, location) => ({
    subject: 'TZW LTD – Fire Extinguisher Assigned to You',
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
      <div style="background:#DC143C;padding:24px 32px"><h2 style="color:white;margin:0">TZW LTD FEMS</h2></div>
      <div style="padding:32px;background:#fff8f0;border:1px solid #fecdd3">
        <h3 style="color:#DC143C">Extinguisher Assigned</h3>
        <p>Hi <strong>${name}</strong>,</p>
        <p>A fire extinguisher has been assigned to your care:</p>
        <table style="border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:4px 12px 4px 0;color:#888;font-size:13px">Serial No.</td><td><strong>${serialNumber}</strong></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#888;font-size:13px">Location</td><td>${location}</td></tr>
        </table>
        <p>Please ensure it remains accessible and in good condition. You can schedule an inspection through the FEMS portal.</p>
        <p style="color:#888;font-size:13px;margin-top:24px">TZW LTD Fire Extinguisher Management System</p>
      </div>
    </div>`,
  }),

  inspectionScheduled: (extId, date, time, scheduledBy) => ({
    subject: 'TZW LTD – Inspection Scheduled',
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
      <div style="background:#DC143C;padding:24px 32px"><h2 style="color:white;margin:0">TZW LTD FEMS</h2></div>
      <div style="padding:32px;background:#fff8f0;border:1px solid #fecdd3">
        <h3 style="color:#DC143C">Inspection Scheduled</h3>
        <p>An inspection has been scheduled:</p>
        <table style="border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:4px 12px 4px 0;color:#888;font-size:13px">Extinguisher</td><td><strong>${extId}</strong></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#888;font-size:13px">Date</td><td>${date}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#888;font-size:13px">Time</td><td>${time}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#888;font-size:13px">Requested by</td><td>${scheduledBy}</td></tr>
        </table>
        <p style="color:#888;font-size:13px;margin-top:24px">TZW LTD Fire Extinguisher Management System</p>
      </div>
    </div>`,
  }),
};

module.exports = { sendMail, templates };
