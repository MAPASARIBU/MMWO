const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { generateWONumber } = require('../controllers/workOrderController');
const { sendNewWONotification } = require('../services/notificationService');

const runHMChecks = async () => {
    console.log('[CRON] Running HM Base checks...');
        try {
            // Find an ADMIN to act as reporter for auto-generated WOs
            const adminUser = await prisma.user.findFirst({
                where: { role: 'ADMIN', is_active: true }
            });
            const reporterId = adminUser ? adminUser.id : 1;

            // Find all active parts that have reached 90% or more of their lifetime
            // and do not currently have an active (non-closed) WO
            const criticalParts = await prisma.part.findMany({
                where: {
                    is_active: true,
                    wos: {
                        none: {
                            status: { notIn: ['CLOSED'] }
                        }
                    }
                },
                include: {
                    equipment: {
                        include: { station: true }
                    }
                }
            });

            // Filter parts >= 90%
            const dueParts = criticalParts.filter(p => {
                if (!p.lifetime_hm || p.lifetime_hm <= 0) return false;
                const percent = (p.current_hm / p.lifetime_hm);
                return percent >= 0.9;
            });

            if (dueParts.length === 0) {
                console.log('[CRON] No due HM Base parts found.');
                return;
            }

            console.log(`[CRON] Found ${dueParts.length} due HM Base part(s). Generating Work Orders...`);

            for (const part of dueParts) {
                const wo_no = await generateWONumber();
                // Format percentage
                const percentInt = Math.round((part.current_hm / part.lifetime_hm) * 100);
                const description = `[AUTO HM BASE] Penggantian Part: ${part.name}\nGenerated automatically because part has reached ${percentInt}% of its lifetime (${part.current_hm} / ${part.lifetime_hm} HM).`;

                // 1. Create Work Order
                const wo = await prisma.workOrder.create({
                    data: {
                        wo_no,
                        mill_id: part.equipment.station.mill_id,
                        station_id: part.equipment.station_id,
                        equipment_id: part.equipment_id,
                        category: 'Mechanical', // Default for parts, but it could be based on equipment if preferred. Usually Mechanical.
                        type: 'Preventive', // HM base is a form of preventive maintenance
                        priority: 'P2', // High priority since it's >= 90%
                        description,
                        status: 'OPEN',
                        reporter_id: reporterId,
                        parts: {
                            connect: { id: part.id } // Link the part to the WO!
                        }
                    }
                });

                // Add audit log
                await prisma.auditLog.create({
                    data: {
                        wo_id: wo.id,
                        user_id: reporterId,
                        action: 'CREATED',
                        new_value: 'OPEN (AUTO HM BASE)'
                    }
                });

                sendNewWONotification(wo.id);

                console.log(`[CRON] Created WO ${wo_no} for Part ID ${part.id} (${part.name})`);
            }
            console.log('[CRON] HM Base checks completed.');
        } catch (error) {
            console.error('[CRON] Error during HM Base checks:', error);
        }
};

const startHMCron = () => {
    cron.schedule('0 0 * * *', runHMChecks);
};

module.exports = { startHMCron, runHMChecks };
