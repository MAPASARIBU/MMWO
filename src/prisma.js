require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

// Factory function to create resilient Prisma client with auto-retry on transient Neon connection drops
function createResilientPrismaClient() {
    const baseClient = new PrismaClient({
        log: ['warn', 'error']
    });

    return baseClient.$extends({
        query: {
            $allOperations: async ({ model, operation, args, query }) => {
                const maxRetries = 3;
                let attempt = 0;
                while (attempt < maxRetries) {
                    try {
                        return await query(args);
                    } catch (error) {
                        attempt++;
                        const isTransient = 
                            error.code === 'P1001' || // Can't reach database server
                            error.code === 'P1002' || // Database server was reached but timed out
                            error.code === 'P1008' || // Operations timed out
                            error.code === 'P1017' || // Server has closed the connection
                            (error.message && (
                                error.message.includes("Can't reach database server") ||
                                error.message.includes("Connection closed") ||
                                error.message.includes("Connection terminated") ||
                                error.message.includes("ETIMEDOUT") ||
                                error.message.includes("ECONNRESET") ||
                                error.message.includes("socket hang up")
                            ));

                        if (isTransient && attempt < maxRetries) {
                            const delay = attempt * 800;
                            console.warn(`[Prisma Retry] Transient database error on ${model || 'raw'}.${operation} (Attempt ${attempt}/${maxRetries}). Retrying in ${delay}ms...`);
                            await new Promise(resolve => setTimeout(resolve, delay));
                        } else {
                            throw error;
                        }
                    }
                }
            }
        }
    });
}

// Global singleton pattern to prevent multiple PrismaClient instances and connection exhaustion
let prisma;

if (process.env.NODE_ENV === 'production') {
    prisma = createResilientPrismaClient();
} else {
    if (!global.prisma) {
        global.prisma = createResilientPrismaClient();
    }
    prisma = global.prisma;
}

module.exports = prisma;

