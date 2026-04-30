const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { generateWONumber } = require('../controllers/workOrderController');

// Helper to calculate next due date based on interval
function calculateNextDueDate(currentDate, intervalType, intervalValue) {
    const nextDate = new Date(currentDate);
    if (intervalType === 'Day') {
        nextDate.setDate(nextDate.getDate() + intervalValue);
    } else if (intervalType === 'Week') {
        nextDate.setDate(nextDate.getDate() + (intervalValue * 7));
    } else if (intervalType === 'Month') {
        nextDate.setMonth(nextDate.getMonth() + intervalValue);
    } else if (intervalType === 'Year') {
        nextDate.setFullYear(nextDate.getFullYear() + intervalValue);
    }
    return nextDate;
}

const startPMCron = () => {
    // Run daily at midnight (00:00)
    cron.schedule('0 0 * * *', async () => {
        console.log('[CRON] Running Periodic PM checks...');
        try {
            // Find an ADMIN to act as reporter for auto-generated WOs
            const adminUser = await prisma.user.findFirst({
                where: { role: 'ADMIN', is_active: true }
            });
            const reporterId = adminUser ? adminUser.id : 1; // Fallback to 1 if no admin found

            const now = new Date();
            
            // Find all active PMs where next_due_date is today or earlier
            const duePMs = await prisma.periodicPM.findMany({
                where: {
                    is_active: true,
                    next_due_date: {
                        lte: now
                    }
                },
                include: {
                    equipment: {
                        include: {
                            station: true
                        }
                    }
                }
            });

            if (duePMs.length === 0) {
                console.log('[CRON] No due Periodic PMs found.');
                return;
            }

            console.log(`[CRON] Found ${duePMs.length} due PM(s). Generating Work Orders...`);

            for (const pm of duePMs) {
                const wo_no = await generateWONumber();
                const description = `[AUTO PM] ${pm.name}\nGenerated automatically from Periodic Maintenance Plan.`;

                // 1. Create Work Order
                const wo = await prisma.workOrder.create({
                    data: {
                        wo_no,
                        mill_id: pm.equipment.station.mill_id,
                        station_id: pm.equipment.station_id,
                        equipment_id: pm.equipment_id,
                        category: pm.category || 'Mechanical',
                        type: 'Preventive',
                        priority: pm.priority || 'P3',
                        description,
                        status: 'OPEN',
                        reporter_id: reporterId,
                    }
                });

                // Add audit log
                await prisma.auditLog.create({
                    data: {
                        wo_id: wo.id,
                        user_id: reporterId,
                        action: 'CREATED',
                        new_value: 'OPEN (AUTO)'
                    }
                });

                // 2. Update PM Plan
                const nextDue = calculateNextDueDate(now, pm.interval_type, pm.interval_value);
                await prisma.periodicPM.update({
                    where: { id: pm.id },
                    data: {
                        last_pm_date: now,
                        next_due_date: nextDue
                    }
                });

                console.log(`[CRON] Created WO ${wo_no} for PM ID ${pm.id}`);
            }
            console.log('[CRON] Periodic PM checks completed.');
        } catch (error) {
            console.error('[CRON] Error during Periodic PM checks:', error);
        }
    });
};

module.exports = { startPMCron, calculateNextDueDate };
