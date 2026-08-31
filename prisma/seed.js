import { PrismaClient } from '@prisma/client';
import {
  DEFAULT_CARD_NUMBER,
  DEFAULT_CARD_HOLDER,
  DEFAULT_REQUIRED_CHANNELS,
} from '../src/config/constants.js';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // 1. Seed Mandatory Channels
  console.log('📢 Seeding default required channels...');
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

  // 2. Seed System Settings
  console.log('⚙️ Seeding system settings...');
  await prisma.systemSetting.upsert({
    where: { key: 'payment_card_number' },
    update: { value: DEFAULT_CARD_NUMBER },
    create: {
      key: 'payment_card_number',
      value: DEFAULT_CARD_NUMBER,
      description: 'To\'lov uchun faol karta raqami',
    },
  });

  await prisma.systemSetting.upsert({
    where: { key: 'payment_card_holder' },
    update: { value: DEFAULT_CARD_HOLDER },
    create: {
      key: 'payment_card_holder',
      value: DEFAULT_CARD_HOLDER,
      description: 'Karta egasi',
    },
  });

  console.log('✅ Database seed completed (no fake promo codes).');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
