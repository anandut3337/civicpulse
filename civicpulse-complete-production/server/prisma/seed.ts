/**
 * Idempotent seed: reference data + SAMPLE geography so the API is usable
 * immediately. All names, coordinates and handles below are placeholders -
 * replace with real government ward data before any real deployment.
 */
import bcrypt from 'bcryptjs';
import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

// Dev-only login for every seeded account: password "Password123!"
const DEV_PASSWORD_HASH = bcrypt.hashSync('Password123!', 12);

const DEPARTMENTS = [
  { name: 'Electricity', code: 'ELEC', contactEmail: 'electricity@example.gov' },
  { name: 'Roads / PWD', code: 'PWD', contactEmail: 'pwd@example.gov' },
  { name: 'Sanitation', code: 'SAN', contactEmail: 'sanitation@example.gov' },
  { name: 'Water / Drainage', code: 'WATER', contactEmail: 'water@example.gov' },
  { name: 'Gas Pipeline', code: 'GAS', contactEmail: 'gas@example.gov' },
  { name: 'Police', code: 'POLICE', contactEmail: 'police@example.gov' },
];

async function main() {
  // --- Departments ---------------------------------------------------------
  for (const d of DEPARTMENTS) {
    await prisma.department.upsert({ where: { code: d.code }, update: d, create: d });
  }

  // --- Sample ward (ward-level row; colonyName = null) ----------------------
  const base = { state: 'Sample State', district: 'Sample District', city: 'Sample City' };

  let ward = await prisma.location.findFirst({ where: { ...base, wardNumber: '12', colonyName: null } });
  if (!ward) {
    ward = await prisma.location.create({
      data: { ...base, wardName: 'Ward 12 - Central', wardNumber: '12', colonyName: null, zipCode: '000001', latitude: 12.9716, longitude: 77.5946 },
    });
  }

  // --- Sample colonies (children of the ward) -------------------------------
  const colonies = [
    { colonyName: 'Rose Garden Colony', zipCode: '000001', latitude: 12.9721, longitude: 77.5951 },
    { colonyName: 'Lake View Colony', zipCode: '000002', latitude: 12.9689, longitude: 77.5902 },
  ];
  for (const c of colonies) {
    await prisma.location.upsert({
      where: {
        state_district_city_wardNumber_colonyName: { ...base, wardNumber: '12', colonyName: c.colonyName },
      },
      update: {},
      create: { ...base, wardName: ward.wardName, wardNumber: '12', parentId: ward.id, ...c },
    });
  }

  // --- Sample accountability handles (PLACEHOLDERS) -------------------------
  const pwd = await prisma.department.findUniqueOrThrow({ where: { code: 'PWD' } });
  await prisma.officialHandle.upsert({
    where: { wardId_departmentId_officialTitle: { wardId: ward.id, departmentId: pwd.id, officialTitle: 'Ward Councillor' } },
    update: {},
    create: { wardId: ward.id, departmentId: pwd.id, officialTitle: 'Ward Councillor', twitterHandle: 'example_councillor', contactPhone: '+910000000000' },
  });

  // General-purpose officials (tagged on every issue in the ward) + the police SP for police issues.
  const police = await prisma.department.findUniqueOrThrow({ where: { code: 'POLICE' } });
  const extraHandles = [
    { departmentId: pwd.id, officialTitle: 'Municipal Commissioner', twitterHandle: 'sample_commissioner', contactPhone: null },
    { departmentId: pwd.id, officialTitle: 'MLA', twitterHandle: 'sample_mla_ward12', contactPhone: null },
    { departmentId: police.id, officialTitle: 'SP', twitterHandle: 'sample_sp_city', contactPhone: '+910000000009' },
  ];
  for (const h of extraHandles) {
    await prisma.officialHandle.upsert({
      where: { wardId_departmentId_officialTitle: { wardId: ward.id, departmentId: h.departmentId, officialTitle: h.officialTitle } },
      update: {},
      create: { wardId: ward.id, ...h },
    });
  }

  // --- Users: one of each role, for local development -----------------------
  await prisma.user.upsert({
    where: { email: 'admin@civicpulse.dev' },
    update: {},
    create: { fullName: 'Dev Admin', email: 'admin@civicpulse.dev', phone: '+910000000001', password: DEV_PASSWORD_HASH, role: Role.ADMIN },
  });
  await prisma.user.upsert({
    where: { email: 'citizen@civicpulse.dev' },
    update: {},
    create: { fullName: 'Dev Citizen', email: 'citizen@civicpulse.dev', phone: '+910000000002', password: DEV_PASSWORD_HASH, role: Role.CITIZEN },
  });
  await prisma.user.upsert({
    where: { email: 'official@civicpulse.dev' },
    update: {},
    create: {
      fullName: 'Dev PWD Official', email: 'official@civicpulse.dev', phone: '+910000000003', password: DEV_PASSWORD_HASH,
      role: Role.OFFICIAL, departmentId: pwd.id, assignedWardId: ward.id,
    },
  });

  console.log('Seed complete. Dev login password for all seeded users: Password123!');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
