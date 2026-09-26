import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(3000),
  PUBLIC_URL: z.string().url(),
  BOT_TOKEN: z.string().min(20),
  BOT_USERNAME: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  TON_NETWORK: z.enum(['mainnet','testnet']).default('testnet'),
  TONCENTER_ENDPOINT: z.string().url(),
  TONCENTER_API_KEY: z.string().optional().default(''),
  VTON_JETTON_MASTER: z.string().min(10),
  VTON_DECIMALS: z.coerce.number().int().min(0).max(18).default(9),
  TREASURY_MNEMONIC: z.string().optional().default(''),
  MINING_RATE_PER_SECOND: z.coerce.number().nonnegative().default(0.00001),
  REFERRAL_PERCENT: z.coerce.number().min(0).max(1).default(0.10),
  MIN_CLAIM: z.coerce.number().nonnegative().default(1),
  CLAIM_FEE_VTON: z.coerce.number().nonnegative().default(0),
  ADMIN_TELEGRAM_ID: z.coerce.bigint().default(0n)
});

export const env = schema.parse(process.env);
