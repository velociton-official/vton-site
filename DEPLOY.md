# VTON deployment

## Required environment variables
PUBLIC_URL
BOT_TOKEN
BOT_USERNAME
DATABASE_URL
TON_NETWORK
TONCENTER_ENDPOINT
VTON_JETTON_MASTER
TREASURY_MNEMONIC

Keep secrets only in the hosting provider secret/environment settings.

## Start
npm install
npx prisma generate
npx prisma migrate deploy
npm run db:seed
npm run start

Run the Telegram bot separately with:
npm run bot

Use an HTTPS public URL. Test claims on TON testnet before mainnet.
