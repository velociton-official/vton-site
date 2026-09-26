import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.task.upsert({
    where: { id: 'join-vton-channel' },
    update: {},
    create: {
      id: 'join-vton-channel',
      title: 'Підписатися на $VTON канал',
      description: 'Підпишись на офіційний Telegram-канал $VTON.',
      type: 'TELEGRAM_CHANNEL',
      target: '@YOUR_VTON_CHANNEL',
      rewardRaw: '1000000000'
    }
  });

  await prisma.task.upsert({
    where: { id: 'open-vton-site' },
    update: {},
    create: {
      id: 'open-vton-site',
      title: 'Відкрити сайт $VTON',
      description: 'Ознайомся з офіційним сайтом проєкту.',
      type: 'OPEN_URL',
      target: 'https://YOUR-DOMAIN.example',
      rewardRaw: '500000000'
    }
  });

  console.log('Seed complete');
}

main().finally(() => prisma.$disconnect());
