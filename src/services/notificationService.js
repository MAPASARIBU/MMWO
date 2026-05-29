const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const whatsappService = require('./whatsappService');

const sendNewWONotification = async (woId) => {
    try {
        const wo = await prisma.workOrder.findUnique({
            where: { id: woId },
            include: {
                station: true,
                equipment: true,
                reporter: true
            }
        });

        if (!wo) return;

        // Determine target roles based on category
        let targetRoles = [];
        if (wo.category === 'Processing') {
            targetRoles = ['PROC', 'SPV', 'MANAGER'];
        } else if (wo.category === 'Office') {
            targetRoles = ['OAA', 'SPV', 'MANAGER'];
        } else {
            targetRoles = ['MTC', 'SPV', 'MANAGER'];
        }

        const targetUsers = await prisma.user.findMany({
            where: {
                mill_id: wo.mill_id,
                role: { in: targetRoles },
                is_active: true,
                phone: { not: null }
            }
        });

        if (targetUsers.length > 0) {
            const equipmentName = wo.equipment ? wo.equipment.name : '-';
            const stationName = wo.station ? wo.station.name : '-';
            
            const appUrl = process.env.APP_URL || 'http://localhost:3000';
            const woLink = `${appUrl}/work-orders/${wo.id}`;
            
            const message = `*WO BARU DIBUAT*\n\n` +
                `*No WO:* ${wo.wo_no}\n` +
                `*Kategori:* ${wo.category}\n` +
                `*Prioritas:* ${wo.priority}\n` +
                `*Station:* ${stationName}\n` +
                `*Equipment:* ${equipmentName}\n` +
                `*Pelapor:* ${wo.reporter ? wo.reporter.name : 'System'}\n\n` +
                `*Deskripsi Masalah:*\n${wo.description}\n\n` +
                `_Mohon segera ditindaklanjuti, klik link di bawah ini untuk melihat detail:_ \n` +
                `${woLink}`;

            for (const targetUser of targetUsers) {
                if (targetUser.phone) {
                    try {
                        await whatsappService.sendMessage(targetUser.phone, message);
                        // Add 1.5 second delay between messages to avoid WhatsApp rate limiting
                        await new Promise(resolve => setTimeout(resolve, 1500));
                    } catch (err) {
                        console.error(`Failed to send WA to ${targetUser.phone}:`, err);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error in sendNewWONotification:', error);
    }
};

module.exports = {
    sendNewWONotification
};
