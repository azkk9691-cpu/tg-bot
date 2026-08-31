import prisma from '../database/prisma.js';
import { DEFAULT_REQUIRED_CHANNELS } from '../config/constants.js';
import { logger } from '../utils/logger.js';

export class ChannelService {
  /**
   * Get all active required channels
   */
  static async getRequiredChannels() {
    try {
      const channels = await prisma.requiredChannel.findMany({
        where: { isActive: true },
        orderBy: { id: 'asc' },
      });

      // If database is empty, seed defaults
      if (channels.length === 0) {
        await this.seedDefaultChannels();
        return await prisma.requiredChannel.findMany({
          where: { isActive: true },
          orderBy: { id: 'asc' },
        });
      }

      return channels;
    } catch (error) {
      logger.warn('Error fetching channels from database, using defaults:', error.message);
      return DEFAULT_REQUIRED_CHANNELS.map((c, i) => ({
        id: i + 1,
        ...c,
        isActive: true,
      }));
    }
  }

  /**
   * Seed default channels if not exists
   */
  static async seedDefaultChannels() {
    try {
      for (const ch of DEFAULT_REQUIRED_CHANNELS) {
        await prisma.requiredChannel.upsert({
          where: { channelUsername: ch.channelUsername },
          update: {
            channelTitle: ch.channelTitle,
            channelUrl: ch.channelUrl,
            isActive: true,
          },
          create: {
            channelUsername: ch.channelUsername,
            channelTitle: ch.channelTitle,
            channelUrl: ch.channelUrl,
            isActive: true,
          },
        });
      }
    } catch (error) {
      logger.error('Error seeding default channels:', error.message);
    }
  }

  /**
   * Check if a user is subscribed to a specific channel
   */
  static async checkUserSubscription(telegram, userId, channelIdentifier) {
    try {
      const chatIdentifier = channelIdentifier.startsWith('@') || channelIdentifier.startsWith('-100')
        ? channelIdentifier
        : `@${channelIdentifier}`;

      const member = await telegram.getChatMember(chatIdentifier, Number(userId));
      const allowedStatuses = ['creator', 'administrator', 'member', 'restricted'];
      
      // If user is actually in the channel
      if (allowedStatuses.includes(member.status)) {
        return true;
      }

      // If user explicitly left or is not a member
      if (member.status === 'left' || member.status === 'kicked') {
        return false;
      }

      return false;
    } catch (error) {
      const description = error.response?.description || error.message || '';
      logger.warn(
        `Subscription check for user ${userId} on ${channelIdentifier}: ${description}`
      );

      // If bot is NOT admin in the channel ('member list is inaccessible' or 'chat not found'),
      // do not permanently block users. Log warning to instruct admin to grant bot permissions.
      if (
        description.includes('member list is inaccessible') ||
        description.includes('chat not found') ||
        description.includes('bot is not a member')
      ) {
        logger.warn(
          `⚠️ DIQQAT: Bot @${channelIdentifier} kanalida Admin emas. Foydalanuvchilar qotib qolmasligi uchun o'tkazildi. Iltimos botni kanalingizga admin qiling!`
        );
        return true;
      }

      return false;
    }
  }

  /**
   * Verify all required channel subscriptions for a user
   */
  static async checkAllSubscriptions(telegram, userId) {
    const channels = await this.getRequiredChannels();
    if (!channels || channels.length === 0) {
      return { isSubscribed: true, missingChannels: [] };
    }

    const missingChannels = [];

    for (const channel of channels) {
      const isMember = await this.checkUserSubscription(
        telegram,
        userId,
        channel.channelUsername
      );
      if (!isMember) {
        missingChannels.push(channel);
      }
    }

    return {
      isSubscribed: missingChannels.length === 0,
      missingChannels,
      totalChannels: channels,
    };
  }

  /**
   * Add a new required channel (Admin)
   */
  static async addChannel(username, title, url) {
    const cleanUsername = username.replace('@', '').trim();
    return await prisma.requiredChannel.upsert({
      where: { channelUsername: cleanUsername },
      update: {
        channelTitle: title || cleanUsername,
        channelUrl: url || `https://t.me/${cleanUsername}`,
        isActive: true,
      },
      create: {
        channelUsername: cleanUsername,
        channelTitle: title || cleanUsername,
        channelUrl: url || `https://t.me/${cleanUsername}`,
        isActive: true,
      },
    });
  }

  /**
   * Toggle channel active status (Admin)
   */
  static async toggleChannel(id) {
    const channel = await prisma.requiredChannel.findUnique({
      where: { id: parseInt(id, 10) },
    });
    if (!channel) return null;

    return await prisma.requiredChannel.update({
      where: { id: channel.id },
      data: { isActive: !channel.isActive },
    });
  }

  /**
   * Delete channel (Admin)
   */
  static async deleteChannel(id) {
    return await prisma.requiredChannel.delete({
      where: { id: parseInt(id, 10) },
    });
  }
}
