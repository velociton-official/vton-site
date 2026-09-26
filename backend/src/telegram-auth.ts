import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from './config.js';

export type TelegramUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

export function validateInitData(initData: string): TelegramUser {
  if (!initData) throw new Error('Missing Telegram initData');
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  const authDate = Number(params.get('auth_date'));
  if (!hash || !authDate) throw new Error('Invalid Telegram initData');
  if (Date.now() / 1000 - authDate > 86400) throw new Error('Telegram initData expired');

  const pairs: string[] = [];
  for (const [key, value] of params.entries()) {
    if (key !== 'hash') pairs.push(key + '=' + value);
  }
  pairs.sort();
  const dataCheckString = pairs.join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(env.BOT_TOKEN).digest();
  const calculated = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  if (calculated.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(calculated, 'hex'), Buffer.from(hash, 'hex'))) {
    throw new Error('Telegram initData signature mismatch');
  }

  const rawUser = params.get('user');
  if (!rawUser) throw new Error('Telegram user missing');
  return JSON.parse(rawUser) as TelegramUser;
}

export function telegramAuth(req: Request, res: Response, next: NextFunction) {
  try {
    res.locals.telegramUser = validateInitData(String(req.header('x-telegram-init-data') || ''));
    next();
  } catch (e) {
    res.status(401).json({ error: e instanceof Error ? e.message : 'Unauthorized' });
  }
}
