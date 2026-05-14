const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { renderView } = require('./indexController');

const getAnalyticsDashboard = async (req, res) => {
    try {
        const user = req.session.user;
        const millId = req.query.mill_id ? parseInt(req.query.mill_id) : (user.role !== 'SENIOR_MANAGER' && user.role !== 'ADMIN' ? user.mill_id : null);

        // Fetch mills for dropdown
        const mills = await prisma.mill.findMany();

        // Base where clause for filtering by mill
        const baseWhere = millId ? { mill_id: millId } : {};

        // 1. MTTR (Mean Time To Repair)
        // Calculated from Breakdown/Corrective WOs that have both started_at and completed_at
        const breakdownWOs = await prisma.workOrder.findMany({
            where: {
                ...baseWhere,
                type: { in: ['Breakdown', 'Corrective'] },
                status: { in: ['COMPLETED', 'VERIFIED', 'CLOSED'] },
                started_at: { not: null },
                completed_at: { not: null }
            },
            select: {
                started_at: true,
                completed_at: true,
                downtime_hours: true,
                rca_category: true
            }
        });

        let totalRepairTimeMs = 0;
        let totalDowntimeHours = 0;
        const rcaDistribution = {};

        breakdownWOs.forEach(wo => {
            totalRepairTimeMs += (new Date(wo.completed_at) - new Date(wo.started_at));
            if (wo.downtime_hours) {
                totalDowntimeHours += wo.downtime_hours;
            }
            if (wo.rca_category) {
                rcaDistribution[wo.rca_category] = (rcaDistribution[wo.rca_category] || 0) + 1;
            }
        });
        const mttrHours = breakdownWOs.length > 0 ? (totalRepairTimeMs / breakdownWOs.length) / (1000 * 60 * 60) : 0;

        // 2. MTBF (Mean Time Between Failures)
        // Simplified proxy: Average time between breakdown WOs for the same equipment.
        const equipmentFailures = await prisma.workOrder.findMany({
            where: {
                ...baseWhere,
                type: { in: ['Breakdown', 'Corrective'] },
                equipment_id: { not: null }
            },
            orderBy: { created_at: 'asc' },
            select: {
                equipment_id: true,
                created_at: true
            }
        });

        let totalTimeBetweenFailuresMs = 0;
        let mtbfCount = 0;
        const failureMap = {}; // equipment_id -> last_failure_date

        equipmentFailures.forEach(wo => {
            const eqId = wo.equipment_id;
            if (failureMap[eqId]) {
                totalTimeBetweenFailuresMs += (new Date(wo.created_at) - new Date(failureMap[eqId]));
                mtbfCount++;
            }
            failureMap[eqId] = wo.created_at;
        });

        const mtbfHours = mtbfCount > 0 ? (totalTimeBetweenFailuresMs / mtbfCount) / (1000 * 60 * 60) : 0;

        // 3. PM Compliance
        // WOs of type Preventive. If completed within 7 days of creation (or before target_finish), it's compliant.
        // For simplicity, let's say "compliant" means completed_at <= target_finish OR completed_at <= created_at + 7 days
        const pmWOs = await prisma.workOrder.findMany({
            where: {
                ...baseWhere,
                type: 'Preventive',
                status: { in: ['COMPLETED', 'VERIFIED', 'CLOSED'] },
                completed_at: { not: null }
            },
            select: {
                created_at: true,
                completed_at: true,
                target_finish: true
            }
        });

        let compliantPMs = 0;
        pmWOs.forEach(wo => {
            const completedAt = new Date(wo.completed_at);
            if (wo.target_finish && completedAt <= new Date(wo.target_finish)) {
                compliantPMs++;
            } else {
                const limitDate = new Date(wo.created_at);
                limitDate.setDate(limitDate.getDate() + 7);
                if (completedAt <= limitDate) {
                    compliantPMs++;
                }
            }
        });

        const pmComplianceRate = pmWOs.length > 0 ? Math.round((compliantPMs / pmWOs.length) * 100) : 0;

        // 4. Equipment Criticality Breakdown
        // Count active WOs grouped by equipment criticality
        const activeWOsWithCriticality = await prisma.workOrder.findMany({
            where: {
                ...baseWhere,
                status: { notIn: ['CLOSED', 'COMPLETED', 'VERIFIED'] },
                equipment: { isNot: null }
            },
            include: {
                equipment: { select: { criticality: true } }
            }
        });

        const criticalityStats = { High: 0, Medium: 0, Low: 0 };
        activeWOsWithCriticality.forEach(wo => {
            let crit = wo.equipment?.criticality || 'Medium';
            if (crit === 'A' || crit.toLowerCase().includes('high')) criticalityStats.High++;
            else if (crit === 'C' || crit.toLowerCase().includes('low')) criticalityStats.Low++;
            else criticalityStats.Medium++;
        });

        // 5. Total Maintenance Cost (Phase 3)
        const materials = await prisma.workOrderMaterial.findMany({
            where: {
                wo: baseWhere
            },
            select: { total_cost: true }
        });
        const totalMaintenanceCost = materials.reduce((sum, m) => sum + (m.total_cost || 0), 0);

        // 6. Predictive Maintenance Forecasting (Phase 3)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // Get HM increments in the last 30 days grouped by equipment
        const hmRecords = await prisma.hMRecord.findMany({
            where: { record_date: { gte: thirtyDaysAgo } },
            select: { equipment_id: true, hm_value: true }
        });

        const eqHmSum = {};
        hmRecords.forEach(r => {
            eqHmSum[r.equipment_id] = (eqHmSum[r.equipment_id] || 0) + r.hm_value;
        });

        let partWhere = { is_active: true };
        if (millId) {
            partWhere.equipment = { is: { station: { is: { mill_id: millId } } } };
        }

        const activeParts = await prisma.part.findMany({
            where: partWhere,
            include: { equipment: { select: { name: true, station: { select: { name: true } } } } }
        });

        const predictedFailures = [];
        activeParts.forEach(part => {
            const sum30 = eqHmSum[part.equipment_id] || 0;
            const avgDailyHm = sum30 / 30;
            
            if (avgDailyHm > 0 && part.lifetime_hm > part.current_hm) {
                const remainingHm = part.lifetime_hm - part.current_hm;
                const daysLeft = Math.floor(remainingHm / avgDailyHm);
                
                // If it fails in less than 30 days, add to warning list
                if (daysLeft <= 30) {
                    const failDate = new Date();
                    failDate.setDate(failDate.getDate() + daysLeft);
                    predictedFailures.push({
                        partName: part.name,
                        equipmentName: part.equipment.name,
                        stationName: part.equipment.station?.name || '-',
                        currentHm: part.current_hm,
                        lifetimeHm: part.lifetime_hm,
                        daysLeft,
                        failDate
                    });
                }
            }
        });

        // Sort by most urgent
        predictedFailures.sort((a, b) => a.daysLeft - b.daysLeft);

        res.render('layout', {
            title: 'Analytics & Reliability (KPI)',
            user,
            path: '/analytics',
            body: await renderView('analytics/index', {
                user,
                mills,
                selectedMillId: millId,
                mttrHours: mttrHours.toFixed(2),
                mtbfHours: mtbfHours.toFixed(2),
                pmComplianceRate,
                totalBreakdowns: breakdownWOs.length,
                totalPMs: pmWOs.length,
                criticalityStats,
                totalDowntimeHours: totalDowntimeHours.toFixed(2),
                rcaDistribution,
                totalMaintenanceCost,
                predictedFailures
            })
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
};

module.exports = {
    getAnalyticsDashboard
};
