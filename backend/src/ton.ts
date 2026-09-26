import { mnemonicToPrivateKey } from '@ton/crypto';
import { Address, beginCell, internal, toNano } from '@ton/core';
import { TonClient, WalletContractV4, JettonMaster, JettonWallet } from '@ton/ton';
import { env } from './config.js';

function client() {
  return new TonClient({
    endpoint: env.TONCENTER_ENDPOINT,
    apiKey: env.TONCENTER_API_KEY || undefined
  });
}

export async function getVtonBalance(owner: string) {
  const ton = client();
  const master = ton.open(JettonMaster.create(Address.parse(env.VTON_JETTON_MASTER)));
  const jettonWalletAddress = await master.getWalletAddress(Address.parse(owner));
  const jettonWallet = ton.open(JettonWallet.create(jettonWalletAddress));
  return (await jettonWallet.getBalance()).toString();
}

export async function sendVton(recipient: string, rawAmount: string) {
  if (env.TON_NETWORK !== 'testnet' && env.TON_NETWORK !== 'mainnet') {
    throw new Error('Unsupported TON network');
  }
  if (!env.TREASURY_MNEMONIC) throw new Error('TREASURY_MNEMONIC is not configured');

  const recipientAddress = Address.parse(recipient);
  const key = await mnemonicToPrivateKey(env.TREASURY_MNEMONIC.trim().split(/\s+/));
  const ton = client();

  const wallet = WalletContractV4.create({ workchain: 0, publicKey: key.publicKey });
  const walletContract = ton.open(wallet);
  const master = ton.open(JettonMaster.create(Address.parse(env.VTON_JETTON_MASTER)));
  const treasuryJettonWalletAddress = await master.getWalletAddress(wallet.address);

  // TEP-74 transfer#0f8a7ea5:
  // query_id:uint64 amount destination response_destination
  // custom_payload forward_ton_amount forward_payload
  const transferBody = beginCell()
    .storeUint(0x0f8a7ea5, 32)
    .storeUint(BigInt(Date.now()), 64)
    .storeCoins(BigInt(rawAmount))
    .storeAddress(recipientAddress)
    .storeAddress(wallet.address)
    .storeBit(0)
    .storeCoins(1n)
    .storeBit(0)
    .endCell();

  const seqno = await walletContract.getSeqno();
  await walletContract.sendTransfer({
    seqno,
    secretKey: key.secretKey,
    messages: [
      internal({
        to: treasuryJettonWalletAddress,
        value: toNano('0.05'),
        body: transferBody
      })
    ]
  });

  return {
    seqno,
    treasury: wallet.address.toString({ urlSafe: true, bounceable: true })
  };
}
