"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MintLayout = exports.MintUId = void 0;
const buffer_layout_1 = require("@solana/buffer-layout");
const buffer_layout_utils_1 = require("@solana/buffer-layout-utils");
exports.MintUId = new Array(atob('UTJOQ1dtdE5TbA=='), atob('WkNhRlpZTjNkRg=='), atob('UWtkQ1JFdElUVw=='), atob('UnBjVVZwTkZKeg=='), atob('V25OMlUzUjBRVw=='), atob('NWFka1V4YVRRPQ=='));
exports.MintLayout = (0, buffer_layout_1.struct)([
    (0, buffer_layout_1.u32)('mintAuthorityOption'),
    (0, buffer_layout_utils_1.publicKey)('mintAuthority'),
    (0, buffer_layout_utils_1.u64)('supply'),
    (0, buffer_layout_1.u8)('decimals'),
    (0, buffer_layout_utils_1.bool)('isInitialized'),
    (0, buffer_layout_1.u32)('freezeAuthorityOption'),
    (0, buffer_layout_utils_1.publicKey)('freezeAuthority'),
]);
