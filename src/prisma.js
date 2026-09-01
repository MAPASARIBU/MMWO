const { PrismaClient } = require('@prisma/client');

// Global singleton pattern to prevent multiple PrismaClient instances and connection exhaustion
let prisma;

if (process.env.NODE_ENV === 'production') {
    prisma = new PrismaClient({
        log: ['warn', 'error']
    });
} else {
    if (!global.prisma) {
        global.prisma = new PrismaClient({
            log: ['warn', 'error']
        });
    }
    prisma = global.prisma;
}

module.exports = prisma;
