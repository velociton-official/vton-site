import { Bot, InlineKeyboard } from 'grammy';
import { prisma } from './db.js';
import { env } from './config.js';

export const bot = new Bot(env.BOT_TOKEN);

function refCode() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

async function ensureUser(tg: any, referralCode?: string) {
  const existing = await prisma.user.findUnique({ where: { telegramId: BigInt(tg.id) } });
  if (existing) return existing;

  let referredById: string | undefined;
  if (referralCode) {
    const ref = await prisma.user.findUnique({ where: { referralCode } });
    if (ref && ref.telegramId !== BigInt(tg.id)) referredById = ref.id;
  }

  return prisma.user.create({
    data: {
      telegramId: BigInt(tg.id),
      username: tg.username,
      firstName: tg.first_name,
      lastName: tg.last_name,
      languageCode: tg.language_code,
      referralCode: refCode(),
      referredById
    }
  });
}

bot.command('start', async ctx => {
  const payload = ctx.match?.trim() || '';
  const referralCode = payload.startsWith('ref_') ? payload.slice(4) : undefined;
  const user = await ensureUser(ctx.from, referralCode);
  const appUrl = env.PUBLIC_URL + '/?startapp=ref_' + user.referralCode;
  await ctx.reply(
    '<b>$VTON Miner</b>\n\nПривіт, ' + escapeHtml(ctx.from.first_name) + '!\n\nВідкрий Mini App та накопичуй $VTON.',
    {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard().webApp('⛏ Відкрити $VTON Miner', appUrl)
    }
  );
});

bot.command('help', ctx => ctx.reply('Команди: /start — відкрити $VTON Miner, /ref — отримати реферальне посилання.'));

bot.command('ref', async ctx => {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from.id) } });
  if (!user) return ctx.reply('Спочатку натисни /start.');
  await ctx.reply('Твоє реферальне посилання:\nhttps://t.me/' + env.BOT_USERNAME + '?start=ref_' + user.referralCode);
});

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
}

if (process.argv[1]?.endsWith('bot.ts')) {
  bot.start();
  console.log('Telegram bot started');
}
