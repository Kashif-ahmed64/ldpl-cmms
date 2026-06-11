import 'dotenv/config';
import os from 'os';
import { prisma } from './lib/prisma.js';
import { startPmSchedulerCron } from './lib/pmSchedule.js';
import { startBackupCron } from './lib/backup.js';
import { validateEnv } from './middleware/security.js';
import { createApp } from './app.js';

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST ?? '0.0.0.0';

validateEnv();

const { httpServer, io } = createApp();

function getLanAddresses(): string[] {
  const nets = os.networkInterfaces();
  const addrs: string[] = [];
  for (const iface of Object.values(nets)) {
    for (const net of iface ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        addrs.push(net.address);
      }
    }
  }
  return addrs;
}

httpServer.listen(PORT, HOST, async () => {
  console.log(`LDPL CMMS API listening on ${HOST}:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);

  const lan = getLanAddresses();
  if (lan.length) {
    console.log('Workstations should connect to:');
    for (const ip of lan) {
      console.log(`  → http://${ip}:${PORT}`);
    }
  }

  const admin = await prisma.user.findUnique({ where: { username: 'admin' } });
  if (admin) {
    startPmSchedulerCron(admin.id, io);
    console.log('PM Scheduler: daily cron started');
    startBackupCron();
  } else {
    console.warn('WARNING: No admin user found — run npm run db:setup on the server PC');
  }
});

export { io };
