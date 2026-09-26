# $VTON Telegram Miner

Telegram Mini App + Node/Express API + PostgreSQL/Prisma + TON Jetton claims.

## Setup
1. Node.js 20+
2. PostgreSQL
3. Copy .env.example to .env
4. Fill Telegram, database and TON variables
5. npm install
6. npm run db:generate
7. npm run db:migrate
8. npm run db:seed
9. npm run dev
10. npm run bot

Never commit .env, a bot token, private key or treasury mnemonic.

## Production
Run the Node server and Telegram bot on a long-running server. Configure the Mini App URL in BotFather. Use TON testnet and a dedicated treasury first.

The mining balance is an off-chain ledger. CLAIM transfers real VTON Jettons from the treasury wallet after the user connects a TON wallet.
