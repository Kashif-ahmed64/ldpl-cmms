import express from 'express';
import cors, { type CorsOptions } from 'cors';
import { createServer, type Server as HttpServer } from 'http';
import { Server as SocketServer, type Server as IoServer } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import departmentRoutes from './routes/departments.js';
import dashboardRoutes from './routes/dashboard.js';
import assetRoutes from './routes/assets.js';
import workOrderRoutes from './routes/workOrders.js';
import pmTemplateRoutes from './routes/pmTemplates.js';
import inventoryRoutes from './routes/inventory.js';
import vendorRoutes from './routes/vendors.js';
import purchaseRequisitionRoutes from './routes/purchaseRequisitions.js';
import purchaseOrderRoutes from './routes/purchaseOrders.js';
import reportRoutes from './routes/reports.js';
import settingsRoutes from './routes/settings.js';
import { securityHeaders, apiRateLimiter } from './middleware/security.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Electron desktop sends null/file origins; also allow LAN workstation IPs. */
const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || origin.startsWith('file://')) return callback(null, true);
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return callback(null, true);
    if (/^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/.test(origin)) return callback(null, true);
    if (/^https?:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/.test(origin)) return callback(null, true);
    callback(null, true);
  },
  credentials: true,
};

export interface AppBundle {
  app: express.Application;
  httpServer: HttpServer;
  io: IoServer;
}

export function createApp(): AppBundle {
  const app = express();
  const httpServer = createServer(app);

  const io = new SocketServer(httpServer, { cors: corsOptions });

  app.set('io', io);

  app.use(securityHeaders);
  app.use(cors(corsOptions));
  app.use(express.json({ limit: '10mb' }));
  app.use('/api', apiRateLimiter);

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      app: 'LDPL CMMS API',
      version: '1.0.0',
      client: 'desktop',
      phase: 'v1.0.0 — Production',
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/departments', departmentRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/assets', assetRoutes);
  app.use('/api/work-orders', workOrderRoutes);
  app.use('/api/pm-templates', pmTemplateRoutes);
  app.use('/api/inventory', inventoryRoutes);
  app.use('/api/vendors', vendorRoutes);
  app.use('/api/purchase-requisitions', purchaseRequisitionRoutes);
  app.use('/api/purchase-orders', purchaseOrderRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/settings', settingsRoutes);

  const uploadDir = process.env.UPLOAD_DIR ?? path.join(__dirname, '../uploads');
  app.use('/uploads', express.static(uploadDir));

  io.on('connection', (socket) => {
    socket.on('join', (userId: string) => {
      socket.join(`user:${userId}`);
    });
  });

  return { app, httpServer, io };
}
