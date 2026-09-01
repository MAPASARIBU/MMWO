const prisma = require('../prisma');
const { renderView } = require('./indexController');

const getWeeklyPlanPage = async (req, res) => {
    try {
        const { week, day, candidateStation, candidateMonth } = req.query;
        const user = req.session.user;
        // Default to current week logic if needed, or just let user filter

        let where = {};
        if (week) where.planned_week = week;
        if (day) where.planned_day = day;

        let categoryFilter;
        const isProcessing = req.path.includes('/processing');
        const isCivil = req.path.includes('/civil');
        const isOffice = req.path.includes('/office');
        
        if (isProcessing) {
            categoryFilter = 'Processing';
        } else if (isCivil) {
            categoryFilter = 'Civil';
        } else if (isOffice) {
            categoryFilter = 'Office';
        } else {
            categoryFilter = { notIn: ['Processing', 'Civil', 'Office'] };
        }

        let woFilter = { 
            category: categoryFilter,
            status: { notIn: ['CLOSED', 'COMPLETED'] }
        };
        
        let targetMillId = null;
        if (user.role === 'ADMIN' || user.role === 'SENIOR_MANAGER') {
            if (req.query.millId) {
                targetMillId = parseInt(req.query.millId);
            } else if (user.current_mill_id) {
                targetMillId = user.current_mill_id;
            }
        } else {
            targetMillId = user.mill_id;
        }

        // Mill Isolation for Plans and Candidates
        if (targetMillId) {
            woFilter.mill_id = targetMillId;
        } else if (user.role === 'SENIOR_MANAGER') {
            woFilter.mill_id = { in: user.accessible_mills || [] };
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
        const currentWeek = getISOWeekString(new Date());

        // --- ASSEMBLE PARALLEL QUERY PROMISES ---

        // 1. Weekly Plans Query
        const plansPromise = prisma.weeklyPlan.findMany({
            where: {
                ...where,
                wo: woFilter
            },
            include: {
                wo: {
                    include: {
                        mill: true,
                        station: true,
                        equipment: true,
                        pics: true
                    }
                },
                planner: { select: { name: true } }
            },
            orderBy: { planned_day: 'desc' }
        });

        // 2. Candidate WOs Query (Sub Sheet 1)
        let candidateWhere = {
            status: { notIn: ['CLOSED', 'COMPLETED'] },
            category: categoryFilter
        };
        
        if (req.query.candidateStations) {
            let st = req.query.candidateStations;
            if (!Array.isArray(st)) st = [st];
            const stationIds = st.map(s => parseInt(s)).filter(s => !isNaN(s));
            if (stationIds.length > 0) {
                candidateWhere.station_id = { in: stationIds };
            }
        }
        
        const hasCandidateFilter = req.query.candidateStartDate && req.query.candidateEndDate;
        if (hasCandidateFilter) {
            const start = new Date(req.query.candidateStartDate);
            start.setHours(0, 0, 0, 0);
            const end = new Date(req.query.candidateEndDate);
            end.setHours(23, 59, 59, 999);
            candidateWhere.created_at = { gte: start, lte: end };
        }

        if (targetMillId) {
            candidateWhere.mill_id = targetMillId;
        } else if (user.role === 'SENIOR_MANAGER') {
            candidateWhere.mill_id = { in: user.accessible_mills || [] };
        }

        const candidateWosPromise = prisma.workOrder.findMany({
            where: candidateWhere,
            select: {
                id: true,
                wo_no: true,
                created_at: true,
                priority: true,
                description: true,
                status: true,
                monthly_plan_status: true,
                station: { select: { id: true, name: true } },
                equipment: { select: { id: true, name: true } },
                weekly_plan: { select: { id: true, planned_week: true, planned_day: true } },
                pics: { select: { id: true, name: true } }
            },
            orderBy: { created_at: 'desc' },
            ...(hasCandidateFilter ? {} : { take: 100 })
        });

        // 3. Workshop Employees Query
        let empWhere = { is_active: true };
        if (targetMillId) {
            empWhere.OR = [
                { mill_id: targetMillId },
                { mill_id: null }
            ];
        } else if (user.role === 'SENIOR_MANAGER') {
            empWhere.OR = [
                { mill_id: { in: user.accessible_mills || [] } },
                { mill_id: null }
            ];
        }
        
        if (isProcessing) {
            empWhere.department = { in: ['Processing Employees I', 'Processing Employees II'] };
        } else {
            empWhere.department = { in: ['Workshop Employees', 'Labour Employees', 'Other Employees'] };
        }

        const workshopEmployeesPromise = prisma.workshopEmployee.findMany({
            where: empWhere,
            select: { id: true, name: true, department: true, position: true },
            orderBy: { name: 'asc' }
        });

        // 4. Stations Query (Scoped strictly to target mill)
        let stationWhere = {};
        if (targetMillId) {
            stationWhere = { mill_id: targetMillId };
        } else if (user.role === 'SENIOR_MANAGER') {
            stationWhere = { mill_id: { in: user.accessible_mills || [] } };
        }

        const stationsPromise = prisma.station.findMany({
            where: stationWhere,
            select: {
                id: true,
                name: true,
                equipment: {
                    select: { id: true, name: true },
                    orderBy: { name: 'asc' }
                }
            },
            orderBy: { name: 'asc' }
        });

        // 5. All Category WOs Query (Sub Sheet 2: Update)
        // Default to active WOs + closed within the last 60 days to keep payload super fast
        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

        let catWhere = {
            category: categoryFilter,
            ...(targetMillId ? { mill_id: targetMillId } : (user.role === 'SENIOR_MANAGER' ? { mill_id: { in: user.accessible_mills || [] } } : {})),
            ...(isProcessing ? {} : { wo_no: { not: { startsWith: 'PRC' } } }),
            OR: [
                { status: { notIn: ['CLOSED', 'COMPLETED'] } },
                { created_at: { gte: sixtyDaysAgo } },
                { completed_at: { gte: sixtyDaysAgo } },
                { closed_at: { gte: sixtyDaysAgo } }
            ]
        };

        const allCategoryWosPromise = prisma.workOrder.findMany({
            where: catWhere,
            select: {
                id: true,
                wo_no: true,
                created_at: true,
                status: true,
                description: true,
                station: { select: { id: true, name: true } },
                equipment: { select: { id: true, name: true } },
                pics: { select: { id: true, name: true } },
                assignee: { select: { id: true, name: true } }
            },
            orderBy: { created_at: 'desc' }
        });

        // 6. Monitoring Timeline Data (Sub Sheet 3: Monitoring Gantt)
        let { startDate: monStartDate, endDate: monEndDate, autoPrint } = req.query;
        let monStart = new Date();
        if (monStartDate) {
            monStart = new Date(monStartDate);
        } else {
            monStart.setDate(monStart.getDate() - 3);
        }
        monStart.setHours(0, 0, 0, 0);

        let monEnd = new Date(monStart);
        if (monEndDate) {
            monEnd = new Date(monEndDate);
            monEnd.setHours(0, 0, 0, 0);
            const diffDays = Math.round(Math.abs((monEnd - monStart) / (1000 * 60 * 60 * 24)));
            if (diffDays > 90) {
                monEnd = new Date(monStart);
                monEnd.setDate(monEnd.getDate() + 90);
            }
        } else {
            monEnd.setDate(monEnd.getDate() + 29); // 30 days total
        }

        const monDates = [];
        let currMon = new Date(monStart);
        while (currMon <= monEnd) {
            monDates.push(new Date(currMon));
            currMon.setDate(currMon.getDate() + 1);
        }

        const windowStart = monDates[0];
        const windowEnd = new Date(monDates[monDates.length - 1]);
        windowEnd.setHours(23, 59, 59, 999);

        const lookbackStart = new Date(windowStart);
        lookbackStart.setDate(lookbackStart.getDate() - 45);
        lookbackStart.setHours(0, 0, 0, 0);

        let monWhere = {
            category: categoryFilter,
            ...(targetMillId ? { mill_id: targetMillId } : (user.role === 'SENIOR_MANAGER' ? { mill_id: { in: user.accessible_mills || [] } } : {})),
            ...(isProcessing ? {} : { wo_no: { not: { startsWith: 'PRC' } } }),
            OR: [
                {
                    created_at: { gte: lookbackStart, lte: windowEnd },
                    OR: [
                        { completed_at: null },
                        { completed_at: { gte: windowStart } },
                        { closed_at: { gte: windowStart } }
                    ]
                },
                {
                    target_finish: { gte: windowStart, lte: windowEnd }
                },
                {
                    started_at: { gte: lookbackStart, lte: windowEnd }
                }
            ]
        };

        const monWosPromise = prisma.workOrder.findMany({
            where: monWhere,
            select: {
                id: true,
                wo_no: true,
                created_at: true,
                target_finish: true,
                started_at: true,
                completed_at: true,
                closed_at: true,
                status: true,
                description: true,
                station: { select: { id: true, name: true } },
                assignee: { select: { id: true, name: true } },
                pics: { select: { id: true, name: true } }
            },
            orderBy: [
                { status: 'asc' },
                { created_at: 'desc' }
            ]
        });

        // 7. Monthly Plan Data (Sub Sheet 4: only for Maintenance Weekly Plan)
        const isMaintenance = !isProcessing && !isCivil && !isOffice;
        const monthlyWosPromise = isMaintenance ? prisma.workOrder.findMany({
            where: {
                ...(targetMillId ? { mill_id: targetMillId } : (user.role === 'SENIOR_MANAGER' ? { mill_id: { in: user.accessible_mills || [] } } : {})),
                monthly_plan_status: 'MONTHLY',
                status: { notIn: ['CLOSED', 'COMPLETED'] }
            },
            include: {
                station: true,
                equipment: true,
                monthly_materials: true
            },
            orderBy: { created_at: 'desc' }
        }) : Promise.resolve([]);

        const historicalMonthlyWosPromise = isMaintenance ? prisma.workOrder.findMany({
            where: {
                ...(targetMillId ? { mill_id: targetMillId } : (user.role === 'SENIOR_MANAGER' ? { mill_id: { in: user.accessible_mills || [] } } : {})),
                monthly_plan_status: 'MONTHLY_DONE',
                status: { notIn: ['CLOSED', 'COMPLETED'] }
            },
            include: {
                station: true,
                monthly_materials: true
            },
            orderBy: { created_at: 'desc' },
            take: 50
        }) : Promise.resolve([]);

        // 8. Analytics & KPI Data (Sub Sheet 5: only for Maintenance Weekly Plan)
        const analyticsWosPromise = isMaintenance ? prisma.workOrder.findMany({
            where: {
                ...(targetMillId ? { mill_id: targetMillId } : (user.role === 'SENIOR_MANAGER' ? { mill_id: { in: user.accessible_mills || [] } } : {})),
                created_at: { gte: sixtyDaysAgo }
            },
            select: {
                id: true,
                type: true,
                status: true,
                priority: true,
                equipment_id: true,
                started_at: true,
                completed_at: true,
                target_finish: true,
                downtime_hours: true,
                rca_category: true,
                created_at: true,
                equipment: { select: { criticality: true } }
            }
        }) : Promise.resolve([]);

        const millsPromise = isMaintenance ? prisma.mill.findMany({ orderBy: { name: 'asc' } }) : Promise.resolve([]);

        // --- EXECUTE ALL QUERIES IN PARALLEL VIA PROMISE.ALL ---
        const [
            plans,
            candidateWos,
            workshopEmployees,
            stations,
            allCategoryWos,
            monWos,
            monthlyWos,
            historicalMonthlyWos,
            analyticsWos,
            mills
        ] = await Promise.all([
            plansPromise,
            candidateWosPromise,
            workshopEmployeesPromise,
            stationsPromise,
            allCategoryWosPromise,
            monWosPromise,
            monthlyWosPromise,
            historicalMonthlyWosPromise,
            analyticsWosPromise,
            millsPromise
        ]);

        const filteredMonWos = monWos.filter(wo => {
            const targetStart = new Date(wo.created_at);
            targetStart.setHours(0, 0, 0, 0);
            const targetFinish = wo.target_finish ? new Date(wo.target_finish) : new Date(targetStart);
            targetFinish.setHours(23, 59, 59, 999);

            const hasTarget = targetStart <= windowEnd && targetFinish >= windowStart;

            let hasActual = false;
            if (wo.started_at) {
                const actualStart = new Date(wo.started_at);
                actualStart.setHours(0, 0, 0, 0);
                let actualFinish = new Date();
                if (wo.completed_at) {
                    actualFinish = new Date(wo.completed_at);
                } else if (wo.closed_at) {
                    actualFinish = new Date(wo.closed_at);
                } else if (wo.status !== 'CLOSED' && wo.status !== 'COMPLETED') {
                    actualFinish = new Date();
                } else {
                    actualFinish = new Date(actualStart);
                }
                actualFinish.setHours(23, 59, 59, 999);
                hasActual = actualStart <= windowEnd && actualFinish >= windowStart;
            }

            return hasTarget || hasActual;
        });

        // --- CALCULATE ANALYTICS & KPI METRICS ---
        let totalRepairTimeMs = 0;
        let totalDowntimeHours = 0;
        let breakdownCount = 0;
        let pmCompliantCount = 0;
        let pmTotalCount = 0;
        const rcaDistribution = {};
        const criticalityStats = { High: 0, Medium: 0, Low: 0 };

        let totalTimeBetweenFailuresMs = 0;
        let mtbfCount = 0;
        const failureMap = {};

        analyticsWos.forEach(wo => {
            // MTTR & Downtime & RCA
            if (['Breakdown', 'Corrective'].includes(wo.type)) {
                if (wo.started_at && wo.completed_at) {
                    totalRepairTimeMs += (new Date(wo.completed_at) - new Date(wo.started_at));
                    breakdownCount++;
                }
                if (wo.downtime_hours) {
                    totalDowntimeHours += wo.downtime_hours;
                }
                if (wo.rca_category) {
                    rcaDistribution[wo.rca_category] = (rcaDistribution[wo.rca_category] || 0) + 1;
                }
                if (wo.equipment_id) {
                    if (failureMap[wo.equipment_id]) {
                        totalTimeBetweenFailuresMs += (new Date(wo.created_at) - new Date(failureMap[wo.equipment_id]));
                        mtbfCount++;
                    }
                    failureMap[wo.equipment_id] = wo.created_at;
                }
            }

            // PM Compliance
            if (wo.type === 'Preventive') {
                pmTotalCount++;
                if (wo.completed_at) {
                    const compDate = new Date(wo.completed_at);
                    if (wo.target_finish && compDate <= new Date(wo.target_finish)) {
                        pmCompliantCount++;
                    } else {
                        const limitDate = new Date(wo.created_at);
                        limitDate.setDate(limitDate.getDate() + 7);
                        if (compDate <= limitDate) pmCompliantCount++;
                    }
                }
            }

            // Criticality
            if (wo.status !== 'CLOSED' && wo.status !== 'COMPLETED') {
                const crit = wo.equipment?.criticality || 'Medium';
                if (crit === 'A' || crit.toLowerCase().includes('high')) criticalityStats.High++;
                else if (crit === 'C' || crit.toLowerCase().includes('low')) criticalityStats.Low++;
                else criticalityStats.Medium++;
            }
        });

        const mttrHours = breakdownCount > 0 ? ((totalRepairTimeMs / breakdownCount) / (1000 * 60 * 60)).toFixed(2) : '0.00';
        const mtbfHours = mtbfCount > 0 ? ((totalTimeBetweenFailuresMs / mtbfCount) / (1000 * 60 * 60)).toFixed(2) : '0.00';
        const pmComplianceRate = pmTotalCount > 0 ? Math.round((pmCompliantCount / pmTotalCount) * 100) : 0;

        const formattedMonDates = monDates.map(d => ({
            date: d,
            dayStr: d.getDate(),
            monthStr: d.toLocaleDateString('id-ID', { month: 'short' }).toUpperCase()
        }));

        const planCategoryName = isProcessing ? 'Processing' : (isCivil ? 'Civil' : (isOffice ? 'Office' : 'Maintenance'));
        const currentPlanTitle = isProcessing ? 'Processing Weekly Plan' : (isCivil ? 'Civil Weekly Plan' : (isOffice ? 'Office Weekly Plan' : 'Maintenance Weekly Plan'));
        const activeTab = req.query.tab || 'plan';

        res.render('layout', {
            title: currentPlanTitle,
            body: await renderView('weeklyPlan', {
                plans,
                candidateWos,
                allCategoryWos,
                processingWos: allCategoryWos,
                currentPlanTitle,
                planCategoryName,
                monWos: filteredMonWos,
                monDates: formattedMonDates,
                monStartDateStr: windowStart.toISOString().split('T')[0],
                monEndDateStr: windowEnd.toISOString().split('T')[0],
                autoPrint: autoPrint === 'true' || autoPrint === true,
                activeTab,
                query: req.query,
                currentWeek,
                workshopEmployees,
                stations,
                user,
                isProcessing,
                isCivil,
                isOffice,
                isMaintenance,
                // Monthly Plan Sub Sheet 4 data
                wos: monthlyWos,
                historicalWos: historicalMonthlyWos,
                // Analytics & KPI Sub Sheet 5 data
                mttrHours,
                mtbfHours,
                pmComplianceRate,
                totalDowntimeHours: totalDowntimeHours.toFixed(2),
                rcaDistribution,
                criticalityStats,
                mills,
                selectedMillId: targetMillId
            }),
            user: req.session.user,
            path: isProcessing ? '/weekly-plan/processing' : (isCivil ? '/weekly-plan/civil' : (isOffice ? '/weekly-plan/office' : '/weekly-plan'))
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading weekly plan');
    }
};

const getWeeklyPlanPrint = async (req, res) => {
    try {
        const { week, day } = req.query;
        let where = {};
        if (week) where.planned_week = week;
        if (day) where.planned_day = day;

        const isProcessing = req.path.includes('/processing');
        const isCivil = req.path.includes('/civil');
        const isOffice = req.path.includes('/office');
        
        let categoryFilter;
        if (isProcessing) {
            categoryFilter = 'Processing';
        } else if (isCivil) {
            categoryFilter = 'Civil';
        } else if (isOffice) {
            categoryFilter = 'Office';
        } else {
            categoryFilter = { notIn: ['Processing', 'Civil', 'Office'] };
        }

        let woFilter = { 
            category: categoryFilter,
            status: { notIn: ['CLOSED', 'COMPLETED'] }
        };

        const plans = await prisma.weeklyPlan.findMany({
            where: {
                ...where,
                wo: woFilter
            },
            include: {
                wo: {
                    include: {
                        mill: true,
                        station: true,
                        equipment: true,
                        pics: true
                    }
                },
                planner: { select: { name: true } }
            },
            orderBy: { created_at: 'desc' }
        });

        const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        // Group plans by category
        const groupedPlans = {};
        plans.forEach(plan => {
            const category = plan.wo.category || 'Uncategorized';
            if (!groupedPlans[category]) {
                groupedPlans[category] = [];
            }
            groupedPlans[category].push(plan);
        });

        const processingStationOrder = [
            "FFB Reception", "Sterilizer", "Threshing", "Pressing",
            "Nut & Kernel", "Clarification", "Power Plant", "Steam Plant",
            "Kernel Bin Storage", "Water Treatment Plant", "CPO Washing Plant", "Effluent Pond"
        ].map(s => s.toLowerCase());

        // Sort each category's plans by station name (custom order for Processing, alphabetical for others)
        for (const cat in groupedPlans) {
            groupedPlans[cat].sort((a, b) => {
                const statA = a.wo.station ? a.wo.station.name : 'Z';
                const statB = b.wo.station ? b.wo.station.name : 'Z';
                
                if (isProcessing) {
                    const indexA = processingStationOrder.indexOf(statA.toLowerCase());
                    const indexB = processingStationOrder.indexOf(statB.toLowerCase());
                    
                    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                    if (indexA !== -1) return -1;
                    if (indexB !== -1) return 1;
                }
                
                return statA.localeCompare(statB);
            });
        }

        res.render('weekly_plan_print', {
            groupedPlans,
            query: req.query,
            user: req.session.user,
            today,
            isProcessing,
            isCivil,
            isOffice
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading weekly plan print view');
    }
};

module.exports = {
    getWeeklyPlanPage,
    getWeeklyPlanPrint
};
