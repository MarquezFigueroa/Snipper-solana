"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setUpLogger = exports.logger = void 0;
const winston_1 = __importDefault(require("winston"));
const pino_1 = __importDefault(require("pino"));
const transport = pino_1.default.transport({
    targets: [
        {
            level: 'trace',
            target: 'pino-pretty',
            options: {
                colorize: true,
                customColors: 'warn:red,info:blue,error:red',
            },
        },
    ],
});
exports.logger = (0, pino_1.default)({
    level: 'trace',
    redact: ['poolKeys'],
    serializers: {
        error: pino_1.default.stdSerializers.err,
    },
    base: undefined,
}, transport);
const setUpLogger = () => {
    return winston_1.default.createLogger({
        transports: [
            new winston_1.default.transports.Console({
                format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.colorize(), winston_1.default.format.printf((info) => `${info.timestamp} ${info.level}: ${info.message}`)),
            }),
            new winston_1.default.transports.File({
                filename: 'combined.log',
                level: 'info',
                format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.printf((info) => `${info.timestamp} ${info.level}: ${info.message}`)),
            }),
            new winston_1.default.transports.File({
                filename: 'errors.log',
                level: 'error',
                format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.printf((info) => `${info.timestamp} ${info.level}: ${info.message}`)),
            }),
        ],
    });
};
exports.setUpLogger = setUpLogger;
