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
exports.logEmitter = void 0;
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const bot_start_1 = require("./bot_start");
const events_1 = require("events");
exports.logEmitter = new events_1.EventEmitter();
// Cargar variables de entorno desde .env
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server);
app.use(express_1.default.json());
// Servir archivos estáticos desde la raíz de "dist"
app.use(express_1.default.static(path_1.default.join(__dirname)));
// Rutas para la API
app.get('/api/wallet-info', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const walletInfo = yield (0, bot_start_1.getWalletInfo)();
        res.json(walletInfo);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to get wallet info' });
    }
}));
app.post('/api/start-bot', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield (0, bot_start_1.runListener)(io); // Pasar la instancia de socket.io aquí
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to start bot' });
    }
}));
app.post('/api/stop-bot', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield (0, bot_start_1.stopListener)(io); // Pasar la instancia de socket.io aquí
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to stop bot' });
    }
}));
// Nueva ruta para actualizar la configuración del bot
app.post('/api/update-bot-config', (req, res) => {
    try {
        const newConfig = req.body;
        (0, bot_start_1.updateBotConfig)(newConfig); // Actualizar la configuración del bot
        res.json({ success: true });
        exports.logEmitter.emit('log', 'info', `Configuration updated: ${JSON.stringify(newConfig)}`);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to update bot configuration' });
    }
});
// Manejar todas las otras rutas y servir el archivo "index.html"
app.get('*', (req, res) => {
    res.sendFile(path_1.default.join(__dirname, 'index.html'));
});
io.on('connection', (socket) => {
    console.log('A user connected');
    socket.emit('log', { level: 'info', message: 'Welcome, you are connected!' });
    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});
// Emitir un mensaje de prueba cuando el servidor se inicie
exports.logEmitter.on('log', (level, message) => {
    io.emit('log', { level, message });
});
// Escuchar el puerto y manejar errores
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    // Emitir mensaje de prueba aquí también para asegurar que el servidor está escuchando
    exports.logEmitter.emit('log', 'info', `Server is listening on port ${PORT}`);
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use.`);
    }
    else {
        console.error(`Server error: ${err}`);
    }
});
