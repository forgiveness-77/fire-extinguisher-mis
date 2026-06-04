require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...\n');

  // ── Users ──────────────────────────────────────────────────────────────────
  const users = [
    { firstName: 'Peace', lastName: 'Admin', email: 'fpeacelove77@gmail.com', password: 'fpeacelove77', role: 'admin',     status: 'active' },
    { firstName: 'Jane',  lastName: 'Inspector', email: 'inspector@tzwltd.com', password: 'Inspect@123',  role: 'inspector', status: 'active' },
    { firstName: 'Bob',   lastName: 'User',      email: 'user@tzwltd.com',      password: 'User@123',     role: 'user',      status: 'active' },
  ];

  const createdUsers = {};
  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 12);
    const record = await prisma.user.upsert({
      where: { email: u.email },
      update: { status: u.status, role: u.role },
      create: { firstName: u.firstName, lastName: u.lastName, email: u.email, passwordHash: hash, role: u.role, status: u.status },
    });
    createdUsers[u.role] = record;
    console.log(`  [User] ${u.email} — ${u.role} (${u.status})`);
  }

  // ── Extinguishers ──────────────────────────────────────────────────────────
  const now = new Date();
  const extinguishers = [
    { serialNumber: 'FE-A001', location: 'Floor 1 – Reception',        type: 'CO2',         size: 5,    installationDate: new Date('2024-06-01'), expiryDate: new Date('2027-06-01'), assignedUserId: createdUsers['user'].id },
    { serialNumber: 'FE-A002', location: 'Floor 1 – Kitchen',          type: 'Foam',        size: 9,    installationDate: new Date('2024-03-15'), expiryDate: new Date('2027-03-15'), assignedUserId: null },
    { serialNumber: 'FE-A003', location: 'Floor 2 – Server Room',      type: 'CO2',         size: 2.5,  installationDate: new Date('2022-06-01'), expiryDate: new Date('2025-06-01'), assignedUserId: null },
    { serialNumber: 'FE-A004', location: 'Floor 2 – Conference Room',  type: 'DryChemical', size: 5,    installationDate: new Date('2024-01-20'), expiryDate: new Date('2027-01-20'), assignedUserId: null },
    { serialNumber: 'FE-A005', location: 'Basement – Car Park',        type: 'Water',       size: 12,   installationDate: new Date('2024-09-01'), expiryDate: new Date('2026-08-01'), assignedUserId: null },
  ];

  for (const e of extinguishers) {
    await prisma.extinguisher.upsert({
      where: { serialNumber: e.serialNumber },
      update: {
        location: e.location, type: e.type, size: e.size,
        installationDate: e.installationDate, expiryDate: e.expiryDate,
        assignedUserId: e.assignedUserId,
      },
      create: e,
    });
    const status = e.expiryDate < now ? 'expired' : e.assignedUserId ? 'active' : 'inactive';
    console.log(`  [Extinguisher] ${e.serialNumber} — ${e.location} (${status})`);
  }

  console.log('\nSeed complete!\n');
  console.log('Default credentials:');
  console.log('  Admin:     fpeacelove77@gmail.com / fpeacelove77');
  console.log('  Inspector: inspector@tzwltd.com   / Inspect@123');
  console.log('  User:      user@tzwltd.com        / User@123');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
