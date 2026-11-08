import { prisma } from '../lib/prisma';
import { getCache, setCache, deleteCache } from '../lib/redis';
import { NotFoundError, AuthorizationError, ConflictError } from '@agentic/shared';
import { REDIS_KEYS } from '@agentic/shared';

export class UserService {
  async getUserById(userId: string) {
    const cached = await getCache(REDIS_KEYS.USER_CACHE(userId));
    if (cached) return cached;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { preferences: true },
    });
    if (!user) throw new NotFoundError('User');

    const safe = this.sanitizeUser(user);
    await setCache(REDIS_KEYS.USER_CACHE(userId), safe, 3600);
    return safe;
  }

  async updateUser(userId: string, data: any) {
    const allowedFields = ['firstName', 'lastName', 'username', 'avatarUrl'];
    const updateData: Record<string, any> = {};
    for (const field of allowedFields) {
      if (data[field] !== undefined) updateData[field] = data[field];
    }

    // Check username uniqueness
    if (updateData.username) {
      const exists = await prisma.user.findFirst({
        where: { username: updateData.username, NOT: { id: userId } },
      });
      if (exists) throw new ConflictError('Username already taken');
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      include: { preferences: true },
    });

    await deleteCache(REDIS_KEYS.USER_CACHE(userId));
    return this.sanitizeUser(user);
  }

  async updateAvatar(userId: string, avatarUrl: string) {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
    });
    await deleteCache(REDIS_KEYS.USER_CACHE(userId));
    return this.sanitizeUser(user);
  }

  async deactivateUser(userId: string) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE role = 'ADMIN' FOR UPDATE`;
      const me = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { role: true } });
      if (me.role === 'ADMIN') {
        const others = await tx.user.count({ where: { role: 'ADMIN', isActive: true, NOT: { id: userId } } });
        if (others === 0) throw new ConflictError('You are the last active admin. Promote someone else first.', 'LAST_ADMIN');
      }
      await tx.user.update({ where: { id: userId }, data: { isActive: false } });
      await tx.refreshToken.updateMany({ where: { userId, isRevoked: false }, data: { isRevoked: true } });
    });
    await deleteCache(REDIS_KEYS.USER_CACHE(userId));
  }

  async getPreferences(userId: string) {
    const prefs = await prisma.userPreferences.findUnique({ where: { userId } });
    if (!prefs) throw new NotFoundError('Preferences');
    return prefs;
  }

  async updatePreferences(userId: string, data: any) {
    const allowedFields = [
      'theme', 'language', 'timezone', 'dailyStudyGoalMinutes',
      'notificationsEnabled', 'emailNotifications', 'voiceEnabled',
      'highContrastMode', 'dyslexiaFriendlyMode', 'fontSize',
      'screenReaderMode', 'simplifiedLanguage',
    ];
    const updateData: Record<string, any> = {};
    for (const field of allowedFields) {
      if (data[field] !== undefined) updateData[field] = data[field];
    }

    return prisma.userPreferences.upsert({
      where: { userId },
      update: updateData,
      create: { userId, ...updateData },
    });
  }

  async getNotifications(userId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.notification.count({ where: { userId } }),
    ]);
    return { notifications, total };
  }

  async markNotificationRead(userId: string, notificationId: string) {
    const notification = await prisma.notification.findUnique({ where: { id: notificationId } });
    if (!notification) throw new NotFoundError('Notification');
    if (notification.userId !== userId) throw new AuthorizationError();
    await prisma.notification.update({ where: { id: notificationId }, data: { isRead: true } });
  }

  private sanitizeUser(user: any) {
    const { passwordHash, googleId, ...safe } = user;
    return {
      ...safe,
      createdAt: user.createdAt?.toISOString?.() ?? user.createdAt,
      updatedAt: user.updatedAt?.toISOString?.() ?? user.updatedAt,
    };
  }
}
