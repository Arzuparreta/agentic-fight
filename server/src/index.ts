import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import os from 'os';
import { RoomManager } from './rooms/manager';
import { registerHandlers } from './websocket/handler';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3002;
const HOST = process.env.HOST || '0.0.0.0';

app.use('/browser', express.static(path.join(__dirname, '../../browser/dist')));
app.use('/mobile', express.static(path.join(__dirname, '../../mobile/dist')));

app.get('/', (_req, res) => {
  res.redirect('/browser');
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const roomManager = new RoomManager();
registerHandlers(io, roomManager);

function getLocalIp(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const iface = interfaces[name];
    if (!iface) continue;
    for (const info of iface) {
      if (info.family === 'IPv4' && !info.internal) {
        return info.address;
      }
    }
  }
  return 'localhost';
}

httpServer.listen(Number(PORT), HOST, () => {
  const localIp = getLocalIp();
  const line = '============================================================';
  console.log('');
  console.log('/' + line + '\\');
  console.log('|              AGENTIC FIGHT — Server Running                |');
  console.log('|' + line + '|');
  console.log(`|  Local:     http://localhost:${PORT}/browser                   |`);
  console.log(`|  Network:   http://${localIp}:${PORT}/browser              |`);
  console.log('|' + line + '|');
  console.log(`|  Mobile:    http://${localIp}:${PORT}/mobile               |`);
  console.log('|            (Open this on your phone browser)               |');
  console.log('\\' + line + '/');
  console.log('');
});
