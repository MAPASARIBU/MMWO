const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const indexController = require('./src/controllers/indexController.js');

async function test() {
    try {
        const req = { 
            session: { user: { id: 1, role: 'SPV', mill_id: 1 } }, 
            query: {} 
        };
        const res = {
            render: (v, d) => {
                if (v === 'layout') console.log('Render layout called successfully!');
                else console.log('Render called for', v);
            },
            status: (s) => ({ send: (msg) => console.log('Error:', s, msg) }),
            redirect: () => console.log('Redirected')
        };
        await indexController.getDashboard(req, res);
    } catch(e) {
        console.error('Test script caught:', e);
    } finally {
        await prisma.$disconnect();
    }
}
test();
