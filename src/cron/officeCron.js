const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { generateWONumber } = require('../controllers/workOrderController');
const { sendNewWONotification } = require('../services/notificationService');
const { calculateNextDueDate } = require('./processingCron');

// Helper to get current ISO Week string (YYYY-W##)
const getISOWeekString = (date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const year = d.getUTCFullYear();
    const weekNo = Math.ceil((((d - new Date(Date.UTC(year, 0, 1))) / 86400000) + 1) / 7);
    return `${year}-W${String(weekNo).padStart(2, '0')}`;
};

const startOfficeCron = () => {
    // Run daily at midnight (00:00)
    cron.schedule('0 * * * *', async () => {
        console.log('[CRON] Running Office Plan checks...');
        try {
            // Find an ADMIN to act as reporter/planner for auto-generated WOs
            const adminUser = await prisma.user.findFirst({
                where: { role: 'ADMIN', is_active: true }
            });
            const adminId = adminUser ? adminUser.id : 1; // Fallback to 1 if no admin found

            const now = new Date();
            
            // Find all active Office Plans where next_due_date is today or earlier
            const duePlans = await prisma.officePlan.findMany({
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
                console.log('[CRON] No due Office Plans found.');
                return;
            }

            console.log(`[CRON] Found ${duePlans.length} due Office Plan(s). Generating Work Orders...`);

            const currentWeek = getISOWeekString(now);

            for (const plan of duePlans) {
                const wo_no = await generateWONumber();
                const description = `[AUTO OFFICE] ${plan.name}\nGenerated automatically from Office Plan Schedule.`;

                // 1. Create Work Order
                const wo = await prisma.workOrder.create({
                    data: {
                        wo_no,
                        mill_id: plan.mill_id,
                        station_id: plan.station_id,
                        category: 'Office',
                        type: 'Office',
                        priority: 'P2', // Priority for processing/office
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
                        new_value: 'OPEN (AUTO OFFICE)'
                    }
                });

                // 2. Create Weekly Plan entry automatically
                await prisma.weeklyPlan.create({
                    data: {
                        wo_id: wo.id,
                        planned_week: currentWeek,
                        planned_day: 'Monday', // Default to Monday
                        planned_by: adminId
                    }
                });

                // 3. Send Notification
                sendNewWONotification(wo.id);
                console.log(`[CRON] Generated WO ${wo_no} for Office Plan: ${plan.name}`);

                // 4. Update Next Due Date for the plan
                const nextDue = calculateNextDueDate(now, plan.interval_type, plan.interval_value);
                
                await prisma.officePlan.update({
                    where: { id: plan.id },
                    data: {
                        last_generated: now,
                        next_due_date: nextDue
                    }
                });
                
                console.log(`[CRON] Office Plan ${plan.id} next due date updated to ${nextDue.toISOString()}`);
            }

        } catch (error) {
            console.error('[CRON] Error during Office Plan generation:', error);
        }
    });
};

module.exports = { startOfficeCron };
