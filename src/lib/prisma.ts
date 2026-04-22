import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function makeClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  // If no real DB configured yet, still export a client so build can complete.
  // Any query at runtime will throw a clear error.
  const adapter = connectionString
    ? new PrismaPg({ connectionString })
    : new PrismaPg({ connectionString: 'postgresql://invalid:invalid@localhost:5432/invalid' });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const prisma = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
