/**
 * Mint a DEV-ONLY JWT for a seeded user:
 *     npm run dev:token -- citizen@civicpulse.dev
 * Replace with a real login flow (phone OTP / OAuth) before production.
 */
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error('Usage: npm run dev:token -- <email>');

  const prisma = new PrismaClient();
  const user = await prisma.user.findUnique({ where: { email } });
  await prisma.$disconnect();
  if (!user) throw new Error(`No user with email ${email}`);

  const token = jwt.sign(
    { role: user.role, departmentId: user.departmentId, assignedWardId: user.assignedWardId },
    process.env.JWT_SECRET as string,
    { subject: user.id, expiresIn: '7d' },
  );
  console.log(token);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
