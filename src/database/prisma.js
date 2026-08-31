import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';

let prisma;

if (!global.__prisma) {
  global.__prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

prisma = global.__prisma;

export async function connectDatabase() {
  try {
    await prisma.$connect();
    logger.info('Database connection established successfully via Prisma.');
    return true;
  } catch (error) {
    logger.error('Failed to connect to database:', error.message);
    return false;
  }
}

export async function disconnectDatabase() {
  try {
    await prisma.$disconnect();
    logger.info('Database connection closed.');
  } catch (error) {
    logger.error('Error disconnecting database:', error.message);
  }
}

export { prisma };
export default prisma;
