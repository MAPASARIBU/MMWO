const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { generateWONumber } = require('../controllers/workOrderController');
const { sendNewWONotification } = require('../services/notificationService');

// Helper to calculate next due date based on interval
function calculateNextDueDate(currentDate, intervalType, intervalValue) {
    const nextDate = new Date(currentDate);
    if (intervalType === 'Weekly') {
        nextDate.setDate(nextDate.getDate() + (intervalValue * 7));
    } else if (intervalType === 'Monthly') {
        nextDate.setMonth(nextDate.getMonth() + intervalValue);
    } else if (intervalType === 'Quarterly') {
        nextDate.setMonth(nextDate.getMonth() + (intervalValue * 3));
    } else if (intervalType === 'Semesterly') {
        nextDate.setMonth(nextDate.getMonth() + (intervalValue * 6));
    } else if (intervalType === 'Annually') {
        nextDate.setFullYear(nextDate.getFullYear() + intervalValue);
    } else {
        // Fallback for Day
        nextDate.setDate(nextDate.getDate() + intervalValue);
    }
    return nextDate;
}

// Helper to get current ISO Week string (YYYY-W##)
const getISOWeekString = (date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const year = d.getUTCFullYear();
    const weekNo = Math.ceil((((d - new Date(Date.UTC(year, 0, 1))) / 86400000) + 1) / 7);
    return `${year}-W${String(weekNo).padStart(2, '0')}`;
};

const startProcessingCron = () => {
    // Run daily at midnight (00:00)
    cron.schedule('0 0 * * *', async () => {
        console.log('[CRON] Running Processing Plan checks...');
        try {
            // Find an ADMIN to act as reporter/planner for auto-generated WOs
            const adminUser = await prisma.user.findFirst({
                where: { role: 'ADMIN', is_active: true }
            });
            const adminId = adminUser ? adminUser.id : 1; // Fallback to 1 if no admin found

            const now = new Date();
            
            // Find all active Processing Plans where next_due_date is today or earlier
            const duePlans = await prisma.processingPlan.findMany({
                where: {
                    is_active: true,
                    next_due_date: {
                        lte: now
                    }
                },
                include: {
                    station: true
                }
            });

            if (duePlans.length === 0) {
                console.log('[CRON] No due Processing Plans found.');
                return;
            }

            console.log(`[CRON] Found ${duePlans.length} due Processing Plan(s). Generating Work Orders...`);

            const currentWeek = getISOWeekString(now);

            for (const plan of duePlans) {
                const wo_no = await generateWONumber();
                const description = `[AUTO PROCESSING] ${plan.name}\nGenerated automatically from Processing Plan Schedule.`;

                // 1. Create Work Order
                const wo = await prisma.workOrder.create({
                    data: {
                        wo_no,
                        mill_id: plan.mill_id,
                        station_id: plan.station_id,
                        category: 'Processing',
                        type: 'Processing',
                        priority: 'P2', // Priority for processing
                        description,
                        status: 'OPEN',
                        reporter_id: adminId,
                    }
                });

                // Add audit log
                await prisma.auditLog.create({
                    data: {
                        wo_id: wo.id,
                        user_id: adminId,
                        action: 'CREATED',
                        new_value: 'OPEN (AUTO PROCESSING)'
                    }
                });

                // 2. Add to Weekly Plan automatically
                await prisma.weeklyPlan.create({
                    data: {
                        wo_id: wo.id,
                        planned_week: currentWeek,
                        planned_day: 'Monday', // Default day, can be changed later by planner
                        planned_by: adminId
                    }
                });

                sendNewWONotification(wo.id);

                // 3. Update Processing Plan Schedule
                const nextDue = calculateNextDueDate(now, plan.interval_type, plan.interval_value);
                await prisma.processingPlan.update({
                    where: { id: plan.id },
                    data: {
                        last_generated: now,
                        next_due_date: nextDue
                    }
                });

                console.log(`[CRON] Created WO ${wo_no} & added to Weekly Plan for Processing Plan ID ${plan.id}`);
            }
            console.log('[CRON] Processing Plan checks completed.');
        } catch (error) {
            console.error('[CRON] Error during Processing Plan checks:', error);
        }
    });
};

module.exports = { startProcessingCron, calculateNextDueDate };
