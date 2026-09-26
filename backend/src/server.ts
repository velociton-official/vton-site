import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { z } from 'zod';
import { prisma } from './db.js';
import { env } from './config.js';
import { telegramAuth } from './telegram-auth.js';
import { accrue, rawFromDecimal, rawToDecimal } from './mining.js';
import { sendVton, getVtonBalance } from './ton.js';

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: env.PUBLIC_URL, credentials: false }));
app.use(express.json({ limit: '256kb' }));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.resolve(__dirname, '../../frontend')));
app.get('/health', (_req, res) => res.json({ ok: true, token: '$VTON' }));
app.use('/api', telegramAuth);

async function currentUser(res: express.Response) {
  const tg = res.locals.telegramUser;
  return prisma.user.upsert({
    where: { telegramId: BigInt(tg.id) },
    update: { username: tg.username, firstName: tg.first_name, lastName: tg.last_name, languageCode: tg.language_code },
    create: {
      telegramId: BigInt(tg.id),
      username: tg.username,
      firstName: tg.first_name,
      lastName: tg.last_name,
      languageCode: tg.language_code,
      referralCode: Math.random().toString(36).slice(2, 10).toUpperCase()
    }
  });
}

app.get('/api/me', async (_req, res) => {
  const user = await currentUser(res);
  await accrue(user.id);
  const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  const referrals = await prisma.user.count({ where: { referredById: user.id } });
  let onChainBalance = '0';
  if (fresh.walletAddress) {
    try { onChainBalance = rawToDecimal(BigInt(await getVtonBalance(fresh.walletAddress))); } catch {}
  }
  res.json({
    id: fresh.id,
    telegramId: fresh.telegramId.toString(),
    username: fresh.username,
    firstName: fresh.firstName,
    walletAddress: fresh.walletAddress,
    referralCode: fresh.referralCode,
    balance: rawToDecimal(BigInt(fresh.balanceRaw.toString())),
    onChainBalance,
    claimed: rawToDecimal(BigInt(fresh.claimedRaw.toString())),
    referrals,
    miningRatePerSecond: env.MINING_RATE_PER_SECOND,
    token: '$VTON',
    decimals: env.VTON_DECIMALS
  });
});

app.post('/api/wallet', async (req, res) => {
  const body = z.object({ address: z.string().min(40).max(80) }).parse(req.body);
  const user = await currentUser(res);
  const { Address } = await import('@ton/core');
  const parsed = Address.parse(body.address);
  const saved = await prisma.user.update({
    where: { id: user.id },
    data: { walletAddress: parsed.toString({ urlSafe: true, bounceable: true }) }
  });
  res.json({ ok: true, walletAddress: saved.walletAddress });
});

app.get('/api/tasks', async (_req, res) => {
  const user = await currentUser(res);
  const tasks = await prisma.task.findMany({
    where: { active: true },
    include: { users: { where: { userId: user.id } },
    },
    orderBy: { createdAt: 'asc' }
  });
  res.json(tasks.map(t => ({
    id: t.id,
    title: t.title,
    description: t.description,
    type: t.type,
    target: t.target,
    reward: rawToDecimal(BigInt(t.rewardRaw.toString())),
    completed: Boolean(t.users[0]?.completedAt)
  })));
});

app.post('/api/tasks/:id/verify', async (req, res) => {
  const user = await currentUser(res);
  const task = await prisma.task.findUnique({ where: { id: req.params.id } });
  if (!task || !task.active) return res.status(404).json({ error: 'Task not found' });

  if (task.type === 'TELEGRAM_CHANNEL') {
    const { bot } = await import('./bot.js');
    try {
      const member = await bot.api.getChatMember(task.target, Number(user.telegramId));
      if (!['member', 'administrator', 'creator'].includes(member.status)) {
        return res.status(400).json({ error: 'Join the Telegram channel first' });
      }
    } catch {
      return res.status(400).json({ error: 'Bot cannot verify this channel. Add the bot as administrator.' });
    }
  }

  const result = await prisma.$transaction(async tx => {
    const existing = await tx.userTask.findUnique({
      where: { userId_taskId: { userId: user.id, taskId: task.id } }
    });
    if (existing?.completedAt) return existing;

    const completed = await tx.userTask.upsert({
      where: { userId_taskId: { userId: user.id, taskId: task.id } },
      create: { userId: user.id, taskId: task.id, completedAt: new Date(), rewardPaid: true },
      update: { completedAt: new Date(), rewardPaid: true }
    });
    await tx.user.update({ where: { id: user.id }, data: { balanceRaw: { increment: task.rewardRaw } } });
    return completed;
  });

  res.json({
    ok: true,
    completedAt: result.completedAt,
    reward: rawToDecimal(BigInt(task.rewardRaw.toString()))
  });
});

app.post('/api/claim', async (req, res) => {
  const body = z.object({ address: z.string().min(40).max(80) }).parse(req.body);
  const { Address } = await import('@ton/core');
  const walletAddress = Address.parse(body.address).toString({ urlSafe: true, bounceable: true });
  const user = await currentUser(res);

  if (user.walletAddress !== walletAddress) {
    return res.status(400).json({ error: 'Connect/save this wallet first' });
  }

  const minClaimRaw = rawFromDecimal(env.MIN_CLAIM);
  await accrue(user.id);
  const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  const amount = BigInt(fresh.balanceRaw.toString());
  if (amount < minClaimRaw) {
    return res.status(400).json({ error: 'Minimum claim is ' + env.MIN_CLAIM + ' VTON' });
  }

  const claim = await prisma.$transaction(async tx => {
    const locked = await tx.user.updateMany({
      where: { id: user.id, balanceRaw: { gte: amount } },
      data: { balanceRaw: { decrement: amount } }
    });
    if (locked.count !== 1) throw new Error('Balance changed; retry');
    return tx.claim.create({ data: { userId: user.id, amountRaw: amount.toString(), wallet: walletAddress } });
  });

  try {
    await sendVton(walletAddress, amount.toString());
    await prisma.$transaction([
      prisma.claim.update({ where: { id: claim.id }, data: { status: 'SENT' } }),
      prisma.user.update({ where: { id: user.id }, data: { claimedRaw: { increment: amount.toString() } } })
    ]);
    res.json({ ok: true, claimId: claim.id, amount: rawToDecimal(amount), status: 'SENT' });
  } catch (e) {
    await prisma.$transaction([
      prisma.claim.update({ where: { id: claim.id }, data: { status: 'FAILED', error: e instanceof Error ? e.message : 'Transfer failed' } }),
      prisma.user.update({ where: { id: user.id }, data: { balanceRaw: { increment: amount.toString() } } })
    ]);
    res.status(502).json({ error: 'Blockchain transfer failed; balance was returned', claimId: claim.id });
  }
});

app.get('/api/referral', async (_req, res) => {
  const user = await currentUser(res);
  const count = await prisma.user.count({ where: { referredById: user.id } });
  res.json({
    code: user.referralCode,
    link: 'https://t.me/' + env.BOT_USERNAME + '?start=ref_' + user.referralCode,
    referrals: count,
    bonusPercent: env.REFERRAL_PERCENT * 100
  });
});

app.use((_req, res) => {
  res.sendFile(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../frontend/index.html'));
});

app.listen(env.PORT, () => console.log('$VTON server listening on ' + env.PORT));
