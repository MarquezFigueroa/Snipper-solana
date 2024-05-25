"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWalletInfo = exports.stopListener = exports.runListener = exports.processOpenBookMarket = exports.checkMintable = exports.processRaydiumPool = exports.init = exports.updateBotConfig = void 0;
const raydium_sdk_1 = require("@raydium-io/raydium-sdk");
const spl_token_1 = require("@solana/spl-token");
const web3_js_1 = require("@solana/web3.js");
const tokens_1 = require("./core/tokens");
const tokens_2 = require("./core/tokens");
const mint_1 = require("./core/mint");
const bs58_1 = __importDefault(require("bs58"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const logger_1 = require("./core/logger");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
let io;
const network = 'mainnet-beta';
const RPC_ENDPOINT = (0, tokens_1.retrieveEnvVariable)('RPC_ENDPOINT', logger_1.logger);
const RPC_WEBSOCKET = (0, tokens_1.retrieveEnvVariable)('RPC_WEBSOCKET', logger_1.logger);
const solanaConnection = new web3_js_1.Connection(RPC_ENDPOINT, {
    wsEndpoint: RPC_WEBSOCKET,
});
let existingLiquidityPools = new Set();
let existingOpenBookMarkets = new Set();
let existingTokenAccounts = new Map();
let wallet;
let quoteToken;
let quoteTokenAssociatedAddress;
let quoteAmount;
let quoteMinPoolSizeAmount;
let quoteMaxPoolSizeAmount;
let commitment = (0, tokens_1.retrieveEnvVariable)('COMMITMENT_LEVEL', logger_1.logger);
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
const updateBotConfig = (newConfig) => {
    botConfig = Object.assign(Object.assign({}, botConfig), newConfig);
    console.log('Bot configuration updated:', botConfig);
};
exports.updateBotConfig = updateBotConfig;
let snipeList = [];
function init() {
    return __awaiter(this, void 0, void 0, function* () {
        const RPC_ENDPOINT = (0, tokens_1.retrieveEnvVariable)('RPC_ENDPOINT', logger_1.logger);
        const RPC_WEBSOCKET = (0, tokens_1.retrieveEnvVariable)('RPC_WEBSOCKET', logger_1.logger);
        const MY_PRIVATE_KEY = (0, tokens_1.retrieveEnvVariable)('MY_PRIVATE_KEY', logger_1.logger);
        wallet = web3_js_1.Keypair.fromSecretKey(bs58_1.default.decode(MY_PRIVATE_KEY));
        logger_1.logger.info(`CONNECTED @ ${RPC_ENDPOINT}`);
        logger_1.logger.info('----------------------------------------------------------');
        logger_1.logger.info(`Wallet Address: ${wallet.publicKey}`);
        const TOKEN_SYMB = botConfig.TOKEN_SYMB;
        const BUY_AMOUNT = botConfig.BUY_AMOUNT;
        switch (TOKEN_SYMB) {
            case 'WSOL': {
                quoteToken = raydium_sdk_1.Token.WSOL;
                quoteAmount = new raydium_sdk_1.TokenAmount(raydium_sdk_1.Token.WSOL, BUY_AMOUNT, false);
                quoteMinPoolSizeAmount = new raydium_sdk_1.TokenAmount(quoteToken, botConfig.MIN_POOL_SIZE, false);
                quoteMaxPoolSizeAmount = new raydium_sdk_1.TokenAmount(quoteToken, botConfig.MAX_POOL_SIZE, false);
                break;
            }
            case 'USDC': {
                quoteToken = new raydium_sdk_1.Token(spl_token_1.TOKEN_PROGRAM_ID, new web3_js_1.PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'), 6, 'USDC', 'USDC');
                quoteAmount = new raydium_sdk_1.TokenAmount(quoteToken, BUY_AMOUNT, false);
                break;
            }
            default: {
                throw new Error(`Unsupported "${TOKEN_SYMB}"! ONLY USDC or WSOL`);
            }
        }
        logger_1.logger.info(`Snipelist: ${botConfig.USE_SNIPEDLIST}`);
        logger_1.logger.info(`Mint renounced: ${botConfig.MINT_IS_RENOUNCED}`);
        logger_1.logger.info(`Auto sell: ${botConfig.AUTO_SELL}`);
        logger_1.logger.info(`T/P: ${botConfig.TAKE_PROFIT}%`);
        logger_1.logger.info(`S/L: ${botConfig.STOP_LOSS}%`);
        logger_1.logger.info(`Pool size min >: ${quoteMinPoolSizeAmount.isZero() ? 'false' : quoteMinPoolSizeAmount.toFixed()} ${quoteToken.symbol}`);
        logger_1.logger.info(`Pool size max <: ${quoteMaxPoolSizeAmount.isZero() ? 'false' : quoteMaxPoolSizeAmount.toFixed()} ${quoteToken.symbol}`);
        logger_1.logger.info(`Buy amount: ${quoteAmount.toFixed()} ${quoteToken.symbol}`);
        const tokenAccounts = yield (0, tokens_1.getTokenAccounts)(solanaConnection, wallet.publicKey, commitment);
        for (const ta of tokenAccounts) {
            existingTokenAccounts.set(ta.accountInfo.mint.toString(), {
                mint: ta.accountInfo.mint,
                address: ta.pubkey,
            });
        }
        const tokenAccount = tokenAccounts.find((acc) => acc.accountInfo.mint.toString() === quoteToken.mint.toString());
        if (!tokenAccount) {
            logger_1.logger.error(`---> Put SOL in your wallet and swap SOL to WSOL at https://jup.ag/ <---`);
            throw new Error(`No ${quoteToken.symbol} token account found in wallet: ${wallet.publicKey}`);
        }
        quoteTokenAssociatedAddress = tokenAccount.pubkey;
        loadSnipedList();
    });
}
exports.init = init;
function saveTokenAccount(mint, accountData) {
    const ata = (0, spl_token_1.getAssociatedTokenAddressSync)(mint, wallet.publicKey);
    const tokenAccount = {
        address: ata,
        mint: mint,
        market: {
            bids: accountData.bids,
            asks: accountData.asks,
            eventQueue: accountData.eventQueue,
        },
    };
    existingTokenAccounts.set(mint.toString(), tokenAccount);
    return tokenAccount;
}
function processRaydiumPool(id, poolState) {
    return __awaiter(this, void 0, void 0, function* () {
        let rugRiskDanger = false;
        let rugRisk = 'Unknown';
        if (!shouldBuy(poolState.baseMint.toString())) {
            return;
        }
        if (!quoteMinPoolSizeAmount.isZero()) {
            const poolSize = new raydium_sdk_1.TokenAmount(quoteToken, poolState.swapQuoteInAmount, true);
            const poolTokenAddress = poolState.baseMint.toString();
            if (poolSize.lt(quoteMinPoolSizeAmount) || rugRiskDanger) {
                logger_1.logger.warn(`------------------- POOL SKIPPED | (${poolSize.toFixed()} ${quoteToken.symbol}) ------------------- `);
            }
            else {
                logger_1.logger.info(`--------------!!!!! POOL SNIPED | (${poolSize.toFixed()} ${quoteToken.symbol}) !!!!!-------------- `);
            }
            logger_1.logger.info(`Pool link: https://dexscreener.com/solana/${id.toString()}`);
            logger_1.logger.info(`Pool Open Time: ${new Date(parseInt(poolState.poolOpenTime.toString()) * 1000).toLocaleString()}`);
            logger_1.logger.info(`--------------------- `);
            if (poolSize.lt(quoteMinPoolSizeAmount) || rugRiskDanger) {
                return;
            }
            logger_1.logger.info(`Pool ID: ${id.toString()}`);
            logger_1.logger.info(`Pool link: https://dexscreener.com/solana/${id.toString()}`);
            logger_1.logger.info(`Pool SOL size: ${poolSize.toFixed()} ${quoteToken.symbol}`);
            logger_1.logger.info(`Base Mint: ${poolState.baseMint}`);
            logger_1.logger.info(`Pool Status: ${poolState.status}`);
        }
        if (!quoteMaxPoolSizeAmount.isZero()) {
            const poolSize = new raydium_sdk_1.TokenAmount(quoteToken, poolState.swapQuoteInAmount, true);
            if (poolSize.gt(quoteMaxPoolSizeAmount)) {
                logger_1.logger.warn({
                    mint: poolState.baseMint,
                    pooled: `${poolSize.toFixed()} ${quoteToken.symbol}`,
                }, `Skipping pool, > ${quoteMaxPoolSizeAmount.toFixed()} ${quoteToken.symbol}`, `Swap amount: ${poolSize.toFixed()}`);
                logger_1.logger.info(`---------------------------------------- \n`);
                return;
            }
        }
        if (botConfig.MINT_IS_RENOUNCED) {
            const mintOption = yield checkMintable(poolState.baseMint);
            if (mintOption !== true) {
                logger_1.logger.warn('Skipping, owner can mint tokens!');
                return;
            }
        }
        if (botConfig.ENABLE_BUY) {
            yield buy(id, poolState);
        }
        else {
            logger_1.logger.info(`--------------- TOKEN BUY ---------------- \n`);
        }
    });
}
exports.processRaydiumPool = processRaydiumPool;
function checkMintable(vault) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            let { data } = (yield solanaConnection.getAccountInfo(vault)) || {};
            if (!data) {
                return;
            }
            const deserialize = mint_1.MintLayout.decode(data);
            return deserialize.mintAuthorityOption === 0;
        }
        catch (e) {
            logger_1.logger.debug(e);
            logger_1.logger.error({ mint: vault }, `Failed to check renounced mint`);
        }
    });
}
exports.checkMintable = checkMintable;
function processOpenBookMarket(updatedAccountInfo) {
    return __awaiter(this, void 0, void 0, function* () {
        let accountData;
        try {
            accountData = raydium_sdk_1.MARKET_STATE_LAYOUT_V3.decode(updatedAccountInfo.accountInfo.data);
            if (existingTokenAccounts.has(accountData.baseMint.toString())) {
                return;
            }
            saveTokenAccount(accountData.baseMint, accountData);
        }
        catch (e) {
            logger_1.logger.debug(e);
            logger_1.logger.error({ mint: accountData === null || accountData === void 0 ? void 0 : accountData.baseMint }, `Market process failed`);
        }
    });
}
exports.processOpenBookMarket = processOpenBookMarket;
function buy(accountId, accountData) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        try {
            let tokenAccount = existingTokenAccounts.get(accountData.baseMint.toString());
            if (!tokenAccount) {
                const market = yield (0, tokens_2.getMinimalMarketV3)(solanaConnection, accountData.marketId, commitment);
                tokenAccount = saveTokenAccount(accountData.baseMint, market);
            }
            tokenAccount.poolKeys = (0, tokens_1.createPoolKeys)(accountId, accountData, tokenAccount.market);
            const { innerTransaction } = raydium_sdk_1.Liquidity.makeSwapFixedInInstruction({
                poolKeys: tokenAccount.poolKeys,
                userKeys: {
                    tokenAccountIn: quoteTokenAssociatedAddress,
                    tokenAccountOut: tokenAccount.address,
                    owner: wallet.publicKey,
                },
                amountIn: quoteAmount.raw,
                minAmountOut: 0,
            }, tokenAccount.poolKeys.version);
            const latestBlockhash = yield solanaConnection.getLatestBlockhash({
                commitment: commitment,
            });
            const messageV0 = new web3_js_1.TransactionMessage({
                payerKey: wallet.publicKey,
                recentBlockhash: latestBlockhash.blockhash,
                instructions: [
                    web3_js_1.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 421197 }),
                    web3_js_1.ComputeBudgetProgram.setComputeUnitLimit({ units: 101337 }),
                    (0, spl_token_1.createAssociatedTokenAccountIdempotentInstruction)(wallet.publicKey, tokenAccount.address, wallet.publicKey, accountData.baseMint),
                    ...innerTransaction.instructions,
                ],
            }).compileToV0Message();
            const transaction = new web3_js_1.VersionedTransaction(messageV0);
            transaction.sign([wallet, ...innerTransaction.signers]);
            const rawTransaction = transaction.serialize();
            const signature = yield (0, tokens_1.retry)(() => solanaConnection.sendRawTransaction(rawTransaction, {
                skipPreflight: true,
            }), { retryIntervalMs: 10, retries: 50 });
            logger_1.logger.info({ mint: accountData.baseMint, signature }, `Sent buy tx`);
            const confirmation = yield solanaConnection.confirmTransaction({
                signature,
                lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
                blockhash: latestBlockhash.blockhash,
            }, commitment);
            const basePromise = solanaConnection.getTokenAccountBalance(accountData.baseVault, commitment);
            const quotePromise = solanaConnection.getTokenAccountBalance(accountData.quoteVault, commitment);
            yield Promise.all([basePromise, quotePromise]);
            const baseValue = yield basePromise;
            const quoteValue = yield quotePromise;
            if (((_a = baseValue === null || baseValue === void 0 ? void 0 : baseValue.value) === null || _a === void 0 ? void 0 : _a.uiAmount) && ((_b = quoteValue === null || quoteValue === void 0 ? void 0 : quoteValue.value) === null || _b === void 0 ? void 0 : _b.uiAmount))
                tokenAccount.buyValue = ((_c = quoteValue === null || quoteValue === void 0 ? void 0 : quoteValue.value) === null || _c === void 0 ? void 0 : _c.uiAmount) / ((_d = baseValue === null || baseValue === void 0 ? void 0 : baseValue.value) === null || _d === void 0 ? void 0 : _d.uiAmount);
            if (!confirmation.value.err) {
                logger_1.logger.info({
                    signature,
                    url: `https://solscan.io/tx/${signature}?cluster=${network}`,
                    dex: `https://dexscreener.com/solana/${accountData.baseMint}?maker=${wallet.publicKey}`,
                }, `Confirmed buy tx... @: ${tokenAccount.buyValue} SOL`);
            }
            else {
                logger_1.logger.debug(confirmation.value.err);
                logger_1.logger.info({ mint: accountData.baseMint, signature }, `Error confirming buy tx`);
            }
        }
        catch (e) {
            logger_1.logger.debug(e);
            logger_1.logger.error({ mint: accountData.baseMint }, `Failed to buy token`);
        }
    });
}
function sell(accountId, mint, amount, value) {
    return __awaiter(this, void 0, void 0, function* () {
        let retries = 0;
        do {
            try {
                const tokenAccount = existingTokenAccounts.get(mint.toString());
                if (!tokenAccount) {
                    return true;
                }
                if (!tokenAccount.poolKeys) {
                    logger_1.logger.warn({ mint }, 'No pool keys found');
                    continue;
                }
                if (amount === 0) {
                    logger_1.logger.info({
                        mint: tokenAccount.mint,
                    }, `Empty balance, can't sell`);
                    return true;
                }
                if (tokenAccount.buyValue === undefined)
                    return true;
                const netChange = (value - tokenAccount.buyValue) / tokenAccount.buyValue;
                if (netChange > botConfig.STOP_LOSS && netChange < botConfig.TAKE_PROFIT)
                    return false;
                const { innerTransaction } = raydium_sdk_1.Liquidity.makeSwapFixedInInstruction({
                    poolKeys: tokenAccount.poolKeys,
                    userKeys: {
                        tokenAccountOut: quoteTokenAssociatedAddress,
                        tokenAccountIn: tokenAccount.address,
                        owner: wallet.publicKey,
                    },
                    amountIn: amount,
                    minAmountOut: 0,
                }, tokenAccount.poolKeys.version);
                const latestBlockhash = yield solanaConnection.getLatestBlockhash({
                    commitment: commitment,
                });
                const messageV0 = new web3_js_1.TransactionMessage({
                    payerKey: wallet.publicKey,
                    recentBlockhash: latestBlockhash.blockhash,
                    instructions: [
                        web3_js_1.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 400000 }),
                        web3_js_1.ComputeBudgetProgram.setComputeUnitLimit({ units: 200000 }),
                        ...innerTransaction.instructions,
                        (0, spl_token_1.createCloseAccountInstruction)(tokenAccount.address, wallet.publicKey, wallet.publicKey),
                    ],
                }).compileToV0Message();
                const transaction = new web3_js_1.VersionedTransaction(messageV0);
                transaction.sign([wallet, ...innerTransaction.signers]);
                const signature = yield solanaConnection.sendRawTransaction(transaction.serialize(), {
                    preflightCommitment: commitment,
                });
                logger_1.logger.info({ mint, signature }, `Sent SELL TX...`);
                const confirmation = yield solanaConnection.confirmTransaction({
                    signature,
                    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
                    blockhash: latestBlockhash.blockhash,
                }, commitment);
                if (confirmation.value.err) {
                    logger_1.logger.debug(confirmation.value.err);
                    logger_1.logger.info({ mint, signature }, `Error confirming sell tx`);
                    continue;
                }
                logger_1.logger.info({
                    mint,
                    signature,
                    url: `https://solscan.io/tx/${signature}?cluster=${network}`,
                    dex: `https://dexscreener.com/solana/${mint}?maker=${wallet.publicKey}`,
                }, `Confirmed sell tx... Sold at: ${value}\tNet Profit: ${netChange * 100}%`);
                return true;
            }
            catch (e) {
                retries++;
                logger_1.logger.debug(e);
                logger_1.logger.error({ mint }, `Failed to sell token, retry: ${retries}/${botConfig.MAX_SELL_RETRIES}`);
            }
        } while (retries < botConfig.MAX_SELL_RETRIES);
        return true;
    });
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
        logger_1.logger.info(`Loaded snipe list: ${snipeList.length}`);
    }
}
function shouldBuy(key) {
    return botConfig.USE_SNIPEDLIST ? snipeList.includes(key) : true;
}
const runListener = (socketIo) => __awaiter(void 0, void 0, void 0, function* () {
    io = socketIo;
    yield init();
    const runTimestamp = Math.floor(new Date().getTime() / 1000);
    const raydiumSubscriptionId = solanaConnection.onProgramAccountChange(tokens_1.RAYDIUM_LIQUIDITY_PROGRAM_ID_V4, (updatedAccountInfo) => __awaiter(void 0, void 0, void 0, function* () {
        const key = updatedAccountInfo.accountId.toString();
        const poolState = raydium_sdk_1.LIQUIDITY_STATE_LAYOUT_V4.decode(updatedAccountInfo.accountInfo.data);
        const poolOpenTime = parseInt(poolState.poolOpenTime.toString());
        const existing = existingLiquidityPools.has(key);
        if (poolOpenTime > runTimestamp && !existing) {
            existingLiquidityPools.add(key);
            const _ = processRaydiumPool(updatedAccountInfo.accountId, poolState);
        }
    }), commitment, [
        { dataSize: raydium_sdk_1.LIQUIDITY_STATE_LAYOUT_V4.span },
        {
            memcmp: {
                offset: raydium_sdk_1.LIQUIDITY_STATE_LAYOUT_V4.offsetOf('quoteMint'),
                bytes: quoteToken.mint.toBase58(),
            },
        },
        {
            memcmp: {
                offset: raydium_sdk_1.LIQUIDITY_STATE_LAYOUT_V4.offsetOf('marketProgramId'),
                bytes: tokens_1.OPENBOOK_PROGRAM_ID.toBase58(),
            },
        },
        {
            memcmp: {
                offset: raydium_sdk_1.LIQUIDITY_STATE_LAYOUT_V4.offsetOf('status'),
                bytes: bs58_1.default.encode([6, 0, 0, 0, 0, 0, 0, 0]),
            },
        },
    ]);
    const openBookSubscriptionId = solanaConnection.onProgramAccountChange(tokens_1.OPENBOOK_PROGRAM_ID, (updatedAccountInfo) => __awaiter(void 0, void 0, void 0, function* () {
        const key = updatedAccountInfo.accountId.toString();
        const existing = existingOpenBookMarkets.has(key);
        if (!existing) {
            existingOpenBookMarkets.add(key);
            const _ = processOpenBookMarket(updatedAccountInfo);
        }
    }), commitment, [
        { dataSize: raydium_sdk_1.MARKET_STATE_LAYOUT_V3.span },
        {
            memcmp: {
                offset: raydium_sdk_1.MARKET_STATE_LAYOUT_V3.offsetOf('quoteMint'),
                bytes: quoteToken.mint.toBase58(),
            },
        },
    ]);
    if (botConfig.AUTO_SELL) {
        const walletSubscriptionId = solanaConnection.onProgramAccountChange(spl_token_1.TOKEN_PROGRAM_ID, (updatedAccountInfo) => __awaiter(void 0, void 0, void 0, function* () {
            const accountData = spl_token_1.AccountLayout.decode(updatedAccountInfo.accountInfo.data);
            if (updatedAccountInfo.accountId.equals(quoteTokenAssociatedAddress)) {
                return;
            }
            let completed = false;
            while (!completed) {
                setTimeout(() => { }, 1000);
                const currValue = yield (0, tokens_1.retrieveTokenValueByAddress)(accountData.mint.toBase58());
                if (currValue) {
                    logger_1.logger.info(accountData.mint, `Current Price: ${currValue} SOL`);
                    completed = yield sell(updatedAccountInfo.accountId, accountData.mint, accountData.amount, currValue);
                }
            }
        }), commitment, [
            {
                dataSize: 165,
            },
            {
                memcmp: {
                    offset: 32,
                    bytes: wallet.publicKey.toBase58(),
                },
            },
        ]);
    }
    logger_1.logger.info('-------------------- SEARCH NEW POOLS --------------------');
    io.emit('message', 'Bot iniciado...');
    if (botConfig.USE_SNIPEDLIST) {
        setInterval(loadSnipedList, botConfig.SNIPE_LIST_REFRESH_INTERVAL);
    }
});
exports.runListener = runListener;
// Implementar stopListener si es necesario
const stopListener = (socketIo) => __awaiter(void 0, void 0, void 0, function* () {
    io = socketIo;
    io.emit('message', 'Stopping listener...');
    logger_1.logger.info('Stopping listener...');
    // Aquí puedes agregar el código necesario para detener el bot
});
exports.stopListener = stopListener;
// Implementar getWalletInfo para devolver información de la wallet
const getWalletInfo = () => __awaiter(void 0, void 0, void 0, function* () {
    return {
        address: wallet.publicKey.toBase58(),
        balance: yield solanaConnection.getBalance(wallet.publicKey),
    };
});
exports.getWalletInfo = getWalletInfo;
