import { BigNumberish, Liquidity, LIQUIDITY_STATE_LAYOUT_V4, LiquidityPoolKeys, LiquidityStateV4, MARKET_STATE_LAYOUT_V3, MarketStateV3, Token, TokenAmount } from '@raydium-io/raydium-sdk';
import { AccountLayout, createAssociatedTokenAccountIdempotentInstruction, createCloseAccountInstruction, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Keypair, Connection, PublicKey, ComputeBudgetProgram, KeyedAccountInfo, TransactionMessage, VersionedTransaction, Commitment } from '@solana/web3.js';
import { retry, getTokenAccounts, RAYDIUM_LIQUIDITY_PROGRAM_ID_V4, OPENBOOK_PROGRAM_ID, createPoolKeys, retrieveEnvVariable, retrieveTokenValueByAddress } from './core/tokens';
import { getMinimalMarketV3, MinimalMarketLayoutV3, getRugCheck } from './core/tokens';
import { MintLayout } from './core/mint';
import bs58 from 'bs58';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './core/logger';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
dotenv.config();

let io: Server;

const network = 'mainnet-beta';
const RPC_ENDPOINT = retrieveEnvVariable('RPC_ENDPOINT', logger);
const RPC_WEBSOCKET = retrieveEnvVariable('RPC_WEBSOCKET', logger);

const solanaConnection = new Connection(RPC_ENDPOINT, {
  wsEndpoint: RPC_WEBSOCKET,
});

export type MinimalTokenAccountData = {
  mint: PublicKey;
  address: PublicKey;
  buyValue?: number;
  poolKeys?: LiquidityPoolKeys;
  market?: MinimalMarketLayoutV3;
};

let existingLiquidityPools: Set<string> = new Set<string>();
let existingOpenBookMarkets: Set<string> = new Set<string>();
let existingTokenAccounts: Map<string, MinimalTokenAccountData> = new Map<string, MinimalTokenAccountData>();

let wallet: Keypair;
let quoteToken: Token;
let quoteTokenAssociatedAddress: PublicKey;
let quoteAmount: TokenAmount;
let quoteMinPoolSizeAmount: TokenAmount;
let quoteMaxPoolSizeAmount: TokenAmount;
let commitment: Commitment = retrieveEnvVariable('COMMITMENT_LEVEL', logger) as Commitment;

let botConfig = {
  TOKEN_SYMB: 'WSOL',
  MIN_POOL_SIZE: 5,
  MAX_POOL_SIZE: 999,
  BUY_AMOUNT: 0.01,
  COMMITMENT_LEVEL: 'finalized',
  USE_SNIPEDLIST: false,
  SNIPE_LIST_REFRESH_INTERVAL: 30000,
  MINT_IS_RENOUNCED: true,
  AUTO_SELL: true,
  AUTO_SELL_DELAY: 20000,
  MAX_SELL_RETRIES: 5,
  TAKE_PROFIT: 30,
  STOP_LOSS: 50,
  ENABLE_BUY: true,
};

export const updateBotConfig = (newConfig: Partial<typeof botConfig>) => {
  botConfig = { ...botConfig, ...newConfig };
  console.log('Bot configuration updated:', botConfig);
};



let snipeList: string[] = [];

export async function init(): Promise<void> {
  const RPC_ENDPOINT = retrieveEnvVariable('RPC_ENDPOINT', logger);
  const RPC_WEBSOCKET = retrieveEnvVariable('RPC_WEBSOCKET', logger);

  const MY_PRIVATE_KEY = retrieveEnvVariable('MY_PRIVATE_KEY', logger);
  wallet = Keypair.fromSecretKey(bs58.decode(MY_PRIVATE_KEY));

  logger.info(`CONNECTED @ ${RPC_ENDPOINT}`);
  logger.info('----------------------------------------------------------');
  logger.info(`Wallet Address: ${wallet.publicKey}`);

  const TOKEN_SYMB = botConfig.TOKEN_SYMB;
  const BUY_AMOUNT = botConfig.BUY_AMOUNT;
  switch (TOKEN_SYMB) {
    case 'WSOL': {
      quoteToken = Token.WSOL;
      quoteAmount = new TokenAmount(Token.WSOL, BUY_AMOUNT, false);
      quoteMinPoolSizeAmount = new TokenAmount(quoteToken, botConfig.MIN_POOL_SIZE, false);
      quoteMaxPoolSizeAmount = new TokenAmount(quoteToken, botConfig.MAX_POOL_SIZE, false);
      break;
    }
    case 'USDC': {
      quoteToken = new Token(
        TOKEN_PROGRAM_ID,
        new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
        6,
        'USDC',
        'USDC',
      );
      quoteAmount = new TokenAmount(quoteToken, BUY_AMOUNT, false);
      break;
    }
    default: {
      throw new Error(`Unsupported "${TOKEN_SYMB}"! ONLY USDC or WSOL`);
    }
  }

  logger.info(`Snipelist: ${botConfig.USE_SNIPEDLIST}`);
  logger.info(`Mint renounced: ${botConfig.MINT_IS_RENOUNCED}`);
  logger.info(`Auto sell: ${botConfig.AUTO_SELL}`);
  logger.info(`T/P: ${botConfig.TAKE_PROFIT}%`);
  logger.info(`S/L: ${botConfig.STOP_LOSS}%`);
  logger.info(
    `Pool size min >: ${quoteMinPoolSizeAmount.isZero() ? 'false' : quoteMinPoolSizeAmount.toFixed()} ${quoteToken.symbol}`,
  );
  logger.info(
    `Pool size max <: ${quoteMaxPoolSizeAmount.isZero() ? 'false' : quoteMaxPoolSizeAmount.toFixed()} ${quoteToken.symbol}`,
  );
  logger.info(`Buy amount: ${quoteAmount.toFixed()} ${quoteToken.symbol}`);

  const tokenAccounts = await getTokenAccounts(solanaConnection, wallet.publicKey, commitment);

  for (const ta of tokenAccounts) {
    existingTokenAccounts.set(ta.accountInfo.mint.toString(), <MinimalTokenAccountData>{
      mint: ta.accountInfo.mint,
      address: ta.pubkey,
    });
  }

  const tokenAccount = tokenAccounts.find((acc) => acc.accountInfo.mint.toString() === quoteToken.mint.toString())!;

  if (!tokenAccount) {
    logger.error(`---> Put SOL in your wallet and swap SOL to WSOL at https://jup.ag/ <---`);
    throw new Error(`No ${quoteToken.symbol} token account found in wallet: ${wallet.publicKey}`);
  }

  quoteTokenAssociatedAddress = tokenAccount.pubkey;

  loadSnipedList();
}

function saveTokenAccount(mint: PublicKey, accountData: MinimalMarketLayoutV3) {
  const ata = getAssociatedTokenAddressSync(mint, wallet.publicKey);
  const tokenAccount = <MinimalTokenAccountData>{
    address: ata,
    mint: mint,
    market: <MinimalMarketLayoutV3>{
      bids: accountData.bids,
      asks: accountData.asks,
      eventQueue: accountData.eventQueue,
    },
  };
  existingTokenAccounts.set(mint.toString(), tokenAccount);
  return tokenAccount;
}

export async function processRaydiumPool(id: PublicKey, poolState: LiquidityStateV4) {
  let rugRiskDanger = false;
  let rugRisk = 'Unknown';

  if (!shouldBuy(poolState.baseMint.toString())) {
    return;
  }

  if (!quoteMinPoolSizeAmount.isZero()) {
    const poolSize = new TokenAmount(quoteToken, poolState.swapQuoteInAmount, true);
    const poolTokenAddress = poolState.baseMint.toString();

    if (poolSize.lt(quoteMinPoolSizeAmount) || rugRiskDanger) {
      logger.warn(`------------------- POOL SKIPPED | (${poolSize.toFixed()} ${quoteToken.symbol}) ------------------- `);
    } else {
      logger.info(`--------------!!!!! POOL SNIPED | (${poolSize.toFixed()} ${quoteToken.symbol}) !!!!!-------------- `);
    }

    logger.info(`Pool link: https://dexscreener.com/solana/${id.toString()}`);
    logger.info(`Pool Open Time: ${new Date(parseInt(poolState.poolOpenTime.toString()) * 1000).toLocaleString()}`);
    logger.info(`--------------------- `);

    if (poolSize.lt(quoteMinPoolSizeAmount) || rugRiskDanger) {
      return;
    }

    logger.info(`Pool ID: ${id.toString()}`);
    logger.info(`Pool link: https://dexscreener.com/solana/${id.toString()}`);
    logger.info(`Pool SOL size: ${poolSize.toFixed()} ${quoteToken.symbol}`);
    logger.info(`Base Mint: ${poolState.baseMint}`);
    logger.info(`Pool Status: ${poolState.status}`);
  }

  if (!quoteMaxPoolSizeAmount.isZero()) {
    const poolSize = new TokenAmount(quoteToken, poolState.swapQuoteInAmount, true);

    if (poolSize.gt(quoteMaxPoolSizeAmount)) {
      logger.warn(
        {
          mint: poolState.baseMint,
          pooled: `${poolSize.toFixed()} ${quoteToken.symbol}`,
        },
        `Skipping pool, > ${quoteMaxPoolSizeAmount.toFixed()} ${quoteToken.symbol}`,
        `Swap amount: ${poolSize.toFixed()}`,
      );
      logger.info(`---------------------------------------- \n`);
      return;
    }
  }

  if (botConfig.MINT_IS_RENOUNCED) {
    const mintOption = await checkMintable(poolState.baseMint);

    if (mintOption !== true) {
      logger.warn('Skipping, owner can mint tokens!');
      return;
    }
  }

  if (botConfig.ENABLE_BUY) {
    await buy(id, poolState);
  } else {
    logger.info(`--------------- TOKEN BUY ---------------- \n`);
  }
}

export async function checkMintable(vault: PublicKey): Promise<boolean | undefined> {
  try {
    let { data } = (await solanaConnection.getAccountInfo(vault)) || {};
    if (!data) {
      return;
    }
    const deserialize = MintLayout.decode(data);
    return deserialize.mintAuthorityOption === 0;
  } catch (e) {
    logger.debug(e);
    logger.error({ mint: vault }, `Failed to check renounced mint`);
  }
}

export async function processOpenBookMarket(updatedAccountInfo: KeyedAccountInfo) {
  let accountData: MarketStateV3 | undefined;
  try {
    accountData = MARKET_STATE_LAYOUT_V3.decode(updatedAccountInfo.accountInfo.data);

    if (existingTokenAccounts.has(accountData.baseMint.toString())) {
      return;
    }

    saveTokenAccount(accountData.baseMint, accountData);
  } catch (e) {
    logger.debug(e);
    logger.error({ mint: accountData?.baseMint }, `Market process failed`);
  }
}

async function buy(accountId: PublicKey, accountData: LiquidityStateV4): Promise<void> {
  try {
    let tokenAccount = existingTokenAccounts.get(accountData.baseMint.toString());

    if (!tokenAccount) {
      const market = await getMinimalMarketV3(solanaConnection, accountData.marketId, commitment);
      tokenAccount = saveTokenAccount(accountData.baseMint, market);
    }

    tokenAccount.poolKeys = createPoolKeys(accountId, accountData, tokenAccount.market!);
    const { innerTransaction } = Liquidity.makeSwapFixedInInstruction(
      {
        poolKeys: tokenAccount.poolKeys,
        userKeys: {
          tokenAccountIn: quoteTokenAssociatedAddress,
          tokenAccountOut: tokenAccount.address,
          owner: wallet.publicKey,
        },
        amountIn: quoteAmount.raw,
        minAmountOut: 0,
      },
      tokenAccount.poolKeys.version,
    );

    const latestBlockhash = await solanaConnection.getLatestBlockhash({
      commitment: commitment,
    });
    const messageV0 = new TransactionMessage({
      payerKey: wallet.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 421197 }),
        ComputeBudgetProgram.setComputeUnitLimit({ units: 101337 }),
        createAssociatedTokenAccountIdempotentInstruction(
          wallet.publicKey,
          tokenAccount.address,
          wallet.publicKey,
          accountData.baseMint,
        ),
        ...innerTransaction.instructions,
      ],
    }).compileToV0Message();
    const transaction = new VersionedTransaction(messageV0);
    transaction.sign([wallet, ...innerTransaction.signers]);
    const rawTransaction = transaction.serialize();
    const signature = await retry(
      () =>
        solanaConnection.sendRawTransaction(rawTransaction, {
          skipPreflight: true,
        }),
      { retryIntervalMs: 10, retries: 50 },
    );
    logger.info({ mint: accountData.baseMint, signature }, `Sent buy tx`);
    const confirmation = await solanaConnection.confirmTransaction(
      {
        signature,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        blockhash: latestBlockhash.blockhash,
      },
      commitment,
    );
    const basePromise = solanaConnection.getTokenAccountBalance(accountData.baseVault, commitment);
    const quotePromise = solanaConnection.getTokenAccountBalance(accountData.quoteVault, commitment);

    await Promise.all([basePromise, quotePromise]);

    const baseValue = await basePromise;
    const quoteValue = await quotePromise;

    if (baseValue?.value?.uiAmount && quoteValue?.value?.uiAmount)
      tokenAccount.buyValue = quoteValue?.value?.uiAmount / baseValue?.value?.uiAmount;
    if (!confirmation.value.err) {
      logger.info(
        {
          signature,
          url: `https://solscan.io/tx/${signature}?cluster=${network}`,
          dex: `https://dexscreener.com/solana/${accountData.baseMint}?maker=${wallet.publicKey}`,
        },
        `Confirmed buy tx... @: ${tokenAccount.buyValue} SOL`,
      );
    } else {
      logger.debug(confirmation.value.err);
      logger.info({ mint: accountData.baseMint, signature }, `Error confirming buy tx`);
    }
  } catch (e) {
    logger.debug(e);
    logger.error({ mint: accountData.baseMint }, `Failed to buy token`);
  }
}

async function sell(accountId: PublicKey, mint: PublicKey, amount: BigNumberish, value: number): Promise<boolean> {
  let retries = 0;

  do {
    try {
      const tokenAccount = existingTokenAccounts.get(mint.toString());
      if (!tokenAccount) {
        return true;
      }

      if (!tokenAccount.poolKeys) {
        logger.warn({ mint }, 'No pool keys found');
        continue;
      }

      if (amount === 0) {
        logger.info(
          {
            mint: tokenAccount.mint,
          },
          `Empty balance, can't sell`,
        );
        return true;
      }

      if (tokenAccount.buyValue === undefined) return true;

      const netChange = (value - tokenAccount.buyValue) / tokenAccount.buyValue;
      if (netChange > botConfig.STOP_LOSS && netChange < botConfig.TAKE_PROFIT) return false;

      const { innerTransaction } = Liquidity.makeSwapFixedInInstruction(
        {
          poolKeys: tokenAccount.poolKeys!,
          userKeys: {
            tokenAccountOut: quoteTokenAssociatedAddress,
            tokenAccountIn: tokenAccount.address,
            owner: wallet.publicKey,
          },
          amountIn: amount,
          minAmountOut: 0,
        },
        tokenAccount.poolKeys!.version,
      );

      const latestBlockhash = await solanaConnection.getLatestBlockhash({
        commitment: commitment,
      });
      const messageV0 = new TransactionMessage({
        payerKey: wallet.publicKey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions: [
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 400000 }),
          ComputeBudgetProgram.setComputeUnitLimit({ units: 200000 }),
          ...innerTransaction.instructions,
          createCloseAccountInstruction(tokenAccount.address, wallet.publicKey, wallet.publicKey),
        ],
      }).compileToV0Message();
      
      const transaction = new VersionedTransaction(messageV0);
      transaction.sign([wallet, ...innerTransaction.signers]);
      const signature = await solanaConnection.sendRawTransaction(transaction.serialize(), {
        preflightCommitment: commitment,
      });
      logger.info({ mint, signature }, `Sent SELL TX...`);
      const confirmation = await solanaConnection.confirmTransaction(
        {
          signature,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
          blockhash: latestBlockhash.blockhash,
        },
        commitment,
      );
      if (confirmation.value.err) {
        logger.debug(confirmation.value.err);
        logger.info({ mint, signature }, `Error confirming sell tx`);
        continue;
      }

      logger.info(
        {
          mint,
          signature,
          url: `https://solscan.io/tx/${signature}?cluster=${network}`,
          dex: `https://dexscreener.com/solana/${mint}?maker=${wallet.publicKey}`,
        },
        `Confirmed sell tx... Sold at: ${value}\tNet Profit: ${netChange * 100}%`,
      );
      return true;
    } catch (e: any) {
      retries++;
      logger.debug(e);
      logger.error({ mint }, `Failed to sell token, retry: ${retries}/${botConfig.MAX_SELL_RETRIES}`);
    }
  } while (retries < botConfig.MAX_SELL_RETRIES);
  return true;
}

function loadSnipedList() {
  if (!botConfig.USE_SNIPEDLIST) {
    return;
  }

  const count = snipeList.length;
  const data = fs.readFileSync(path.join(__dirname, 'snipedlist.txt'), 'utf-8');
  snipeList = data
    .split('\n')
    .map((a) => a.trim())
    .filter((a) => a);

  if (snipeList.length != count) {
    logger.info(`Loaded snipe list: ${snipeList.length}`);
  }
}

function shouldBuy(key: string): boolean {
  return botConfig.USE_SNIPEDLIST ? snipeList.includes(key) : true;
}

export const runListener = async (socketIo: Server) => {
  io = socketIo;
  await init();
  const runTimestamp = Math.floor(new Date().getTime() / 1000);

  const raydiumSubscriptionId = solanaConnection.onProgramAccountChange(
    RAYDIUM_LIQUIDITY_PROGRAM_ID_V4,
    async (updatedAccountInfo) => {
      const key = updatedAccountInfo.accountId.toString();
      const poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(updatedAccountInfo.accountInfo.data);
      const poolOpenTime = parseInt(poolState.poolOpenTime.toString());
      const existing = existingLiquidityPools.has(key);

      if (poolOpenTime > runTimestamp && !existing) {
        existingLiquidityPools.add(key);
        const _ = processRaydiumPool(updatedAccountInfo.accountId, poolState);
      }
    },
    commitment,
    [
      { dataSize: LIQUIDITY_STATE_LAYOUT_V4.span },
      {
        memcmp: {
          offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf('quoteMint'),
          bytes: quoteToken.mint.toBase58(),
        },
      },
      {
        memcmp: {
          offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf('marketProgramId'),
          bytes: OPENBOOK_PROGRAM_ID.toBase58(),
        },
      },
      {
        memcmp: {
          offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf('status'),
          bytes: bs58.encode([6, 0, 0, 0, 0, 0, 0, 0]),
        },
      },
    ],
  );

  const openBookSubscriptionId = solanaConnection.onProgramAccountChange(
    OPENBOOK_PROGRAM_ID,
    async (updatedAccountInfo) => {
      const key = updatedAccountInfo.accountId.toString();
      const existing = existingOpenBookMarkets.has(key);
      if (!existing) {
        existingOpenBookMarkets.add(key);
        const _ = processOpenBookMarket(updatedAccountInfo);
      }
    },
    commitment,
    [
      { dataSize: MARKET_STATE_LAYOUT_V3.span },
      {
        memcmp: {
          offset: MARKET_STATE_LAYOUT_V3.offsetOf('quoteMint'),
          bytes: quoteToken.mint.toBase58(),
        },
      },
    ],
  );

  if (botConfig.AUTO_SELL) {
    const walletSubscriptionId = solanaConnection.onProgramAccountChange(
      TOKEN_PROGRAM_ID,
      async (updatedAccountInfo) => {
        const accountData = AccountLayout.decode(updatedAccountInfo.accountInfo!.data);
        if (updatedAccountInfo.accountId.equals(quoteTokenAssociatedAddress)) {
          return;
        }
        let completed = false;
        while (!completed) {
          setTimeout(() => {}, 1000);
          const currValue = await retrieveTokenValueByAddress(accountData.mint.toBase58());
          if (currValue) {
            logger.info(accountData.mint, `Current Price: ${currValue} SOL`);
            completed = await sell(updatedAccountInfo.accountId, accountData.mint, accountData.amount, currValue);
          } 
        }
      },
      commitment,
      [
        {
          dataSize: 165,
        },
        {
          memcmp: {
            offset: 32,
            bytes: wallet.publicKey.toBase58(),
          },
        },
      ],
    );
  }

  logger.info('-------------------- SEARCH NEW POOLS --------------------');
  io.emit('message', 'Bot iniciado...');

  if (botConfig.USE_SNIPEDLIST) {
    setInterval(loadSnipedList, botConfig.SNIPE_LIST_REFRESH_INTERVAL);
  }
};

// Implementar stopListener si es necesario
export const stopListener = async (socketIo: Server) => {
  io = socketIo;
  io.emit('message', 'Stopping listener...');
  logger.info('Stopping listener...');
  // Aquí puedes agregar el código necesario para detener el bot
};

// Implementar getWalletInfo para devolver información de la wallet
export const getWalletInfo = async () => {
  return {
    address: wallet.publicKey.toBase58(),
    balance: await solanaConnection.getBalance(wallet.publicKey),
  };
};
