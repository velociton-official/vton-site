import { prisma } from './db.js';
import { env } from './config.js';

const SCALE = 1000000000000n;
const rateScaled = BigInt(Math.round(env.MINING_RATE_PER_SECOND * Number(SCALE)));
const referralBps = BigInt(Math.round(env.REFERRAL_PERCENT * 10000));

export function rawFromDecimal(value: string | number): bigint {
  const s = String(value);
  const parts = s.split('.');
  const a = parts[0] || '0';
  const b = parts[1] || '';
  const decimals = env.VTON_DECIMALS;
  const frac = (b + '0'.repeat(decimals)).slice(0, decimals);
  return BigInt(a) * 10n ** BigInt(decimals) + BigInt(frac || '0');
}

export function rawToDecimal(raw: bigint): string {
  const decimals = env.VTON_DECIMALS;
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const frac = (raw % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return frac ? whole.toString() + '.' + frac : whole.toString();
}

export async function accrue(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');
  const now = Date.now();
  const elapsed = Math.max(0, Math.floor((now - user.lastAccruedAt.getTime()) / 1000));
  if (elapsed === 0) return user;

  const earned = BigInt(elapsed) * rateScaled / SCALE;
  if (earned <= 0n) {
    return prisma.user.update({ where: { id: userId }, data: { lastAccruedAt: new Date(now) } });
  }

  const refBonus = user.referredById ? earned * referralBps / 10000n : 0n;
  return prisma.$transaction(async tx => {
    const updated = await tx.user.update({
      where: { id: userId },
      data: { balanceRaw: { increment: earned.toString() }, lastAccruedAt: new Date(now) }
    });
    if (user.referredById && refBonus > 0n) {
      await tx.user.update({
        where: { id: user.referredById },
        data: { balanceRaw: { increment: refBonus.toString() } }
      });
    }
    return updated;
  });
}

export { SCALE };
