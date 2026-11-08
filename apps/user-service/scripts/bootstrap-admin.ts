/**
 * First-admin setup. One-time and deliberately narrow:
 *  - refuses NODE_ENV=production or a non-loopback DATABASE_URL unless --production is passed,
 *    so a production database is never changed by accident;
 *  - refuses if an active admin already exists (use the admin console from then on);
 *  - promotes an EXISTING account that has verified its email and is active. It never
 *    creates accounts or handles passwords, so there are no credentials in code or history.
 *
 * Usage, local stack:   npm run admin:bootstrap -- you@example.com
 * Usage, deployment:    docker compose run --rm tools  *                         npx tsx apps/user-service/scripts/bootstrap-admin.ts --production you@example.com
 */
import { PrismaClient } from '@prisma/client';
import { writeAudit } from '../src/services/audit';

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

async function main() {
  const args = process.argv.slice(2);
  const production = args.includes('--production');
  const email = (args.find((a) => !a.startsWith('--')) || '').toLowerCase().trim();
  if (!email) throw new Error('Usage: bootstrap-admin [--production] <email of an existing, verified account>');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set.');
  const host = new URL(url).hostname;
  const remote = process.env.NODE_ENV === 'production' || !LOOPBACK.has(host);
  if (remote && !production) {
    throw new Error(`Refusing to change the database at "${host}" without --production. Re-run with it if this is the deployment you mean.`);
  }
  // The host only; the URL carries the database password.
  console.log(`Database host: ${host}${remote ? ' (production)' : ''}`);

  const prisma = new PrismaClient();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE role = 'ADMIN' FOR UPDATE`;
      const admins = await tx.user.count({ where: { role: 'ADMIN', isActive: true } });
      if (admins > 0) throw new Error('An active admin already exists. Use the admin console to grant roles.');
      const user = await tx.user.findUnique({ where: { email } });
      if (!user) throw new Error('No account with that email. Sign up through the app first.');
      if (!user.isEmailVerified) throw new Error('That account has not verified its email yet.');
      if (!user.isActive) throw new Error('That account is deactivated.');
      await tx.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
      // Their current session still carries the old role claim; make them sign in again.
      await tx.refreshToken.updateMany({ where: { userId: user.id, isRevoked: false }, data: { isRevoked: true } });
      await writeAudit(tx, {
        actorId: null,
        action: 'ADMIN_BOOTSTRAPPED',
        targetUserId: user.id,
        changes: { role: { from: user.role, to: 'ADMIN' } },
      });
    });
    console.log(`Done: ${email} is now an admin. Sign in at /admin/login to open the admin console.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
