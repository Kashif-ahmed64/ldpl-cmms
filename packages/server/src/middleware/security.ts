import type { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';

const DEFAULT_SECRETS = ['dev-secret-change-me', 'dev-refresh-secret-change-me', 'change-this-to-a-long-random-secret-in-production'];

export function validateEnv(): void {
  const isProd = process.env.NODE_ENV === 'production';
  const jwtSecret = process.env.JWT_SECRET ?? '';
  const refreshSecret = process.env.JWT_REFRESH_SECRET ?? '';

  if (isProd && (DEFAULT_SECRETS.includes(jwtSecret) || DEFAULT_SECRETS.includes(refreshSecret))) {
    console.error('FATAL: JWT secrets must be changed in production. Set JWT_SECRET and JWT_REFRESH_SECRET in .env');
    process.exit(1);
  }

  if (!isProd && DEFAULT_SECRETS.includes(jwtSecret)) {
    console.warn('WARNING: Using default JWT_SECRET — change before production deployment');
  }
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.removeHeader('X-Powered-By');
  next();
}

export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});

export function getSecurityStatus() {
  const jwtSecret = process.env.JWT_SECRET ?? '';
  const isProd = process.env.NODE_ENV === 'production';
  return {
    bcryptCostFactor: 12,
    jwtExpiry: process.env.JWT_EXPIRES_IN ?? '8h',
    refreshTokenRotation: true,
    loginLockoutAttempts: 5,
    loginLockoutMinutes: 15,
    rateLimitLogin: '20 req / 15 min per IP',
    rateLimitApi: '300 req / min per IP',
    sqlInjectionProtection: 'Prisma ORM parameterized queries',
    inputValidation: 'Zod schema validation on all endpoints',
    jwtSecretConfigured: !DEFAULT_SECRETS.includes(jwtSecret),
    productionMode: isProd,
    httpsRecommended: 'Configure reverse proxy with TLS for LAN deployment',
    backupEncryption: Boolean(process.env.BACKUP_ENCRYPTION_KEY),
  };
}
