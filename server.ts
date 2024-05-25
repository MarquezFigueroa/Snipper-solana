import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import http from 'http';
import { Server } from 'socket.io';
import { init, runListener, stopListener, getWalletInfo, updateBotConfig } from './bot_start';
import { EventEmitter } from 'events';

export const logEmitter = new EventEmitter();

// Cargar variables de entorno desde .env
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());

// Servir archivos estáticos desde la raíz de "dist"
app.use(express.static(path.join(__dirname)));

// Rutas para la API
app.get('/api/wallet-info', async (req, res) => {
  try {
    const walletInfo = await getWalletInfo();
    res.json(walletInfo);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get wallet info' });
  }
});

app.post('/api/start-bot', async (req, res) => {
  try {
    await runListener(io); // Pasar la instancia de socket.io aquí
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to start bot' });
  }
});

app.post('/api/stop-bot', async (req, res) => {
  try {
    await stopListener(io); // Pasar la instancia de socket.io aquí
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to stop bot' });
  }
});

// Nueva ruta para actualizar la configuración del bot
app.post('/api/update-bot-config', (req, res) => {
  try {
    const newConfig = req.body;
    updateBotConfig(newConfig); // Actualizar la configuración del bot
    res.json({ success: true });
    logEmitter.emit('log', 'info', `Configuration updated: ${JSON.stringify(newConfig)}`);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update bot configuration' });
  }
});

// Manejar todas las otras rutas y servir el archivo "index.html"
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
  console.log('A user connected');
  socket.emit('log', { level: 'info', message: 'Welcome, you are connected!' });

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

// Emitir un mensaje de prueba cuando el servidor se inicie
logEmitter.on('log', (level, message) => {
  io.emit('log', { level, message });
});

// Escuchar el puerto y manejar errores
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  // Emitir mensaje de prueba aquí también para asegurar que el servidor está escuchando
  logEmitter.emit('log', 'info', `Server is listening on port ${PORT}`);
}).on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use.`);
  } else {
    console.error(`Server error: ${err}`);
  }
});
