import { Prisma, UserRole } from '@prisma/client';

// Kept free of Redis and other service clients so the bootstrap CLI can import it and exit cleanly.

export type AuditAction =
  | 'USER_ROLE_CHANGED'
  | 'USER_DEACTIVATED'
  | 'USER_REACTIVATED'
  | 'USER_DELETED'
  | 'ADMIN_BOOTSTRAPPED'
  | 'ADMIN_SIGNED_IN'
  | 'USER_DATA_VIEWED'
  | 'SESSIONS_REVOKED'
  | 'PASSWORD_RESET_SENT'
  | 'VERIFICATION_SENT'
  | 'EMAIL_VERIFIED_BY_ADMIN';

/** Only the fields that changed, as {from, to}. Nothing else is ever written to the trail. */
type AuditChanges = {
  role?: { from: UserRole; to: UserRole };
  isActive?: { from: boolean; to: boolean };
  isEmailVerified?: { from: boolean; to: boolean };
};

export function writeAudit(
  tx: Prisma.TransactionClient,
  entry: { actorId: string | null; action: AuditAction; targetUserId: string; changes?: AuditChanges },
) {
  return tx.adminAuditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      targetUserId: entry.targetUserId,
      changes: entry.changes ? (entry.changes as Prisma.InputJsonValue) : Prisma.JsonNull,
    },
  });
}
