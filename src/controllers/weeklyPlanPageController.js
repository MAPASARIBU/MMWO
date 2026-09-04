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

        const activeTab = req.query.tab || 'plan';
        const isNeedPlan = (activeTab === 'plan');
        const isNeedUpdate = (activeTab === 'update');
        const isNeedMonitoring = (activeTab === 'monitoring');
        const isNeedMonthlyOrders = (activeTab === 'monthly-orders' || activeTab === 'monthly-monitoring-orders');
        const isNeedMonthlyPlan = (activeTab === 'monthly-plan');
        const isNeedAnalytics = (activeTab === 'analytics');

        // --- ASSEMBLE PARALLEL QUERY PROMISES (TARGETED BY ACTIVE TAB FOR MAXIMUM PERFORMANCE) ---

        // 1. Weekly Plans Query (Sub Sheet 1)
        if (!where.planned_week && !where.planned_day) {
            where.planned_week = week || currentWeek;
        }

        const plansPromise = isNeedPlan ? prisma.weeklyPlan.findMany({
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
        }) : Promise.resolve([]);

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

        const candidateWosPromise = isNeedPlan ? prisma.workOrder.findMany({
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
            ...(hasCandidateFilter ? {} : { take: 80 })
        }) : Promise.resolve([]);

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

        const workshopEmployeesPromise = (isNeedPlan || isNeedUpdate) ? prisma.workshopEmployee.findMany({
            where: empWhere,
            select: { id: true, name: true, department: true, position: true },
            orderBy: { name: 'asc' }
        }) : Promise.resolve([]);

        // 4. Stations Query (Scoped strictly to target mill)
        let stationWhere = {};
        if (targetMillId) {
            stationWhere = { mill_id: targetMillId };
        } else if (user.role === 'SENIOR_MANAGER') {
            stationWhere = { mill_id: { in: user.accessible_mills || [] } };
        }

        const stationsPromise = prisma.station.findMany({
            where: stationWhere,
            orderBy: { order_index: 'asc' }
        });

        // 5. All Category WOs Query (Sub Sheet 2: Update)
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

        const allCategoryWosPromise = isNeedUpdate ? prisma.workOrder.findMany({
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
            orderBy: { created_at: 'desc' },
            take: 200
        }) : Promise.resolve([]);

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

        const monWosPromise = isNeedMonitoring ? prisma.workOrder.findMany({
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
            ],
            take: 200
        }) : Promise.resolve([]);

        // 7. Monthly Plan Data (Sub Sheet 4: only for Maintenance Weekly Plan)
        const isMaintenance = !isProcessing && !isCivil && !isOffice;
        const monthlyWosPromise = (isMaintenance && isNeedMonthlyPlan) ? prisma.workOrder.findMany({
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

        const historicalMonthlyWosPromise = (isMaintenance && isNeedMonthlyPlan) ? prisma.workOrder.findMany({
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
        const analyticsWosPromise = (isMaintenance && isNeedAnalytics) ? prisma.workOrder.findMany({
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

        // 9. Monthly Monitoring Order Data (Sub Sheet: Monthly Monitoring Order)
        const monOrderYear = parseInt(req.query.monOrderYear) || new Date().getFullYear();
        const monOrderMonth = (req.query.monOrderMonth !== undefined && req.query.monOrderMonth !== '' && req.query.monOrderMonth !== 'ALL') ? parseInt(req.query.monOrderMonth) : 'ALL';
        const monOrderStation = req.query.monOrderStation || '12_MAIN';
        const monOrderCategory = req.query.monOrderCategory || 'ALL';
        const monOrderPrefix = req.query.monOrderPrefix || 'ALL';
        const monOrderType = req.query.monOrderType || 'ALL';

        let monOrderWhere = {
            created_at: {
                gte: new Date(Date.UTC(monOrderYear, 0, 1, 0, 0, 0, 0)),
                lte: new Date(Date.UTC(monOrderYear, 11, 31, 23, 59, 59, 999))
            },
            ...(targetMillId ? { mill_id: targetMillId } : (user.role === 'SENIOR_MANAGER' ? { mill_id: { in: user.accessible_mills || [] } } : {}))
        };

        if (monOrderCategory && monOrderCategory !== 'ALL') {
            monOrderWhere.category = monOrderCategory;
        } else {
            monOrderWhere.category = { notIn: ['Processing', 'Civil', 'Office'] };
        }

        if (monOrderPrefix === 'WO') {
            monOrderWhere.wo_no = { startsWith: 'WO' };
        } else if (monOrderPrefix === 'FAB') {
            monOrderWhere.wo_no = { startsWith: 'FAB' };
        } else {
            monOrderWhere.OR = [
                { wo_no: { startsWith: 'WO' } },
                { wo_no: { startsWith: 'FAB' } }
            ];
        }

        if (monOrderType && monOrderType !== 'ALL') {
            if (monOrderType === 'Other') {
                monOrderWhere.type = { notIn: ['Preventive', 'Breakdown', 'Corrective', 'Improvement', 'Safety'] };
            } else if (monOrderType === 'Breakdown') {
                monOrderWhere.type = { in: ['Breakdown', 'Corrective'] };
            } else {
                monOrderWhere.type = { equals: monOrderType, mode: 'insensitive' };
            }
        }

        if (monOrderStation && monOrderStation !== '12_MAIN' && monOrderStation !== 'ALL') {
            const sId = parseInt(monOrderStation);
            if (!isNaN(sId)) {
                monOrderWhere.station_id = sId;
            } else {
                monOrderWhere.station = { name: { equals: monOrderStation, mode: 'insensitive' } };
            }
        }

        const monthlyOrderWosPromise = (isMaintenance && isNeedMonthlyOrders) ? prisma.workOrder.findMany({
            where: monOrderWhere,
            select: {
                id: true,
                wo_no: true,
                created_at: true,
                category: true,
                type: true,
                priority: true,
                status: true,
                description: true,
                station_id: true,
                station: { select: { id: true, name: true, order_index: true } },
                equipment: { select: { id: true, name: true } },
                assignee: { select: { id: true, name: true } }
            },
            orderBy: { created_at: 'asc' }
        }) : Promise.resolve([]);

        const millsPromise = isMaintenance ? prisma.mill.findMany({ orderBy: { name: 'asc' } }) : Promise.resolve([]);

        // Helper to safely resolve queries with fallback on network/timeout glitch
        const safeQuery = async (promise, fallback = []) => {
            try {
                return await promise;
            } catch (err) {
                console.warn("Safe query fallback triggered:", err.message);
                return fallback;
            }
        };

        // --- EXECUTE QUERIES IN 2 BALANCED BATCHES TO PREVENT CONNECTION POOL EXHAUSTION ---
        const [
            plans,
            candidateWos,
            workshopEmployees,
            stations,
            mills,
            allCategoryWos
        ] = await Promise.all([
            safeQuery(plansPromise, []),
            safeQuery(candidateWosPromise, []),
            safeQuery(workshopEmployeesPromise, []),
            safeQuery(stationsPromise, []),
            safeQuery(millsPromise, []),
            safeQuery(allCategoryWosPromise, [])
        ]);

        const [
            monWos,
            monthlyWos,
            historicalMonthlyWos,
            analyticsWos,
            monthlyOrderWos
        ] = await Promise.all([
            safeQuery(monWosPromise, []),
            safeQuery(monthlyWosPromise, []),
            safeQuery(historicalMonthlyWosPromise, []),
            safeQuery(analyticsWosPromise, []),
            safeQuery(monthlyOrderWosPromise, [])
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

        // --- 10. CALCULATE MONTHLY MONITORING ORDER MATRIX (12 STASIUN UTAMA & REKAP BULANAN) ---
        const MAIN_12_STATIONS = [
            "FFB Reception",
            "Sterilizer",
            "Threshing",
            "Pressing",
            "Nut & Kernel",
            "Clarification",
            "Power Plant",
            "Steam Plant",
            "Water Treatment Plant",
            "CPO Washing Plant",
            "Effluent Pond",
            "Kernel Bin Storage"
        ];

        const normalizeStation = (name) => {
            if (!name) return 'Other';
            const lower = name.toLowerCase().trim();
            if (lower.includes('ffb') || lower.includes('reception') || lower.includes('loading')) return 'FFB Reception';
            if (lower.includes('steriliz') || lower.includes('rebusan')) return 'Sterilizer';
            if (lower.includes('thresh') || lower.includes('penebah') || lower.includes('tipper')) return 'Threshing';
            if (lower.includes('press') || lower.includes('kempa') || lower.includes('digester')) return 'Pressing';
            if (lower.includes('nut') || (lower.includes('kernel') && !lower.includes('bin') && !lower.includes('storage'))) return 'Nut & Kernel';
            if (lower.includes('clarif') || lower.includes('pemurnian') || lower.includes('cst')) return 'Clarification';
            if (lower.includes('power') || lower.includes('turbin') || lower.includes('genset')) return 'Power Plant';
            if (lower.includes('steam') || lower.includes('boiler') || lower.includes('ketel')) return 'Steam Plant';
            if (lower.includes('water') || lower.includes('treatment') || lower.includes('wtp')) return 'Water Treatment Plant';
            if (lower.includes('wash') || lower.includes('washing')) return 'CPO Washing Plant';
            if (lower.includes('effluent') || lower.includes('limbah') || lower.includes('pond')) return 'Effluent Pond';
            if (lower.includes('storage bin') || lower.includes('kernel bin') || lower.includes('bin storage')) return 'Kernel Bin Storage';
            return name;
        };

        let monitoringStationRows = [];

        if (monOrderStation === '12_MAIN') {
            monitoringStationRows = MAIN_12_STATIONS.map((name, idx) => {
                const found = stations.find(s => normalizeStation(s.name) === name);
                return {
                    no: idx + 1,
                    stationId: found ? found.id : null,
                    stationName: name,
                    isMainStation: true
                };
            });
        } else if (monOrderStation === 'ALL') {
            monitoringStationRows = stations.map((s, idx) => ({
                no: idx + 1,
                stationId: s.id,
                stationName: s.name,
                isMainStation: MAIN_12_STATIONS.includes(normalizeStation(s.name))
            }));
        } else {
            const stId = parseInt(monOrderStation);
            const found = stations.find(s => s.id === stId || (s.name && s.name.toLowerCase() === String(monOrderStation).toLowerCase()));
            if (found) {
                monitoringStationRows = [{
                    no: 1,
                    stationId: found.id,
                    stationName: found.name,
                    isMainStation: MAIN_12_STATIONS.includes(normalizeStation(found.name))
                }];
            } else {
                monitoringStationRows = MAIN_12_STATIONS.map((name, idx) => {
                    const f = stations.find(s => normalizeStation(s.name) === name);
                    return {
                        no: idx + 1,
                        stationId: f ? f.id : null,
                        stationName: name,
                        isMainStation: true
                    };
                });
            }
        }

        const monthNamesShort = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
        const monthNamesFull = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

        const monthlyOrderMatrix = monitoringStationRows.map(row => {
            const typeCounts = {
                Preventive: 0,
                Breakdown: 0,
                Improvement: 0,
                Safety: 0,
                Other: 0
            };

            const months = Array(12).fill(null).map((_, mIdx) => ({
                monthIndex: mIdx,
                monthName: monthNamesShort[mIdx],
                monthFullName: monthNamesFull[mIdx],
                count: 0,
                woCount: 0,
                fabCount: 0,
                closedCount: 0,
                openCount: 0,
                preventiveCount: 0,
                breakdownCount: 0,
                improvementCount: 0,
                safetyCount: 0,
                otherCount: 0,
                wos: []
            }));

            monthlyOrderWos.forEach(wo => {
                let isMatch = false;
                if (monOrderStation === '12_MAIN') {
                    const woNorm = normalizeStation(wo.station?.name);
                    isMatch = (woNorm === row.stationName);
                } else {
                    isMatch = (row.stationId && wo.station_id === row.stationId) || (wo.station?.name === row.stationName);
                }

                if (isMatch) {
                    const dt = new Date(wo.created_at);
                    const m = dt.getMonth();
                    if (m >= 0 && m < 12) {
                        months[m].count++;
                        if (wo.wo_no && wo.wo_no.startsWith('FAB')) {
                            months[m].fabCount++;
                        } else {
                            months[m].woCount++;
                        }

                        if (wo.status === 'CLOSED' || wo.status === 'COMPLETED') {
                            months[m].closedCount++;
                        } else {
                            months[m].openCount++;
                        }

                        const t = (wo.type || '').trim();
                        if (t === 'Preventive') {
                            months[m].preventiveCount++;
                            typeCounts.Preventive++;
                        } else if (t === 'Breakdown' || t === 'Corrective') {
                            months[m].breakdownCount++;
                            typeCounts.Breakdown++;
                        } else if (t === 'Improvement') {
                            months[m].improvementCount++;
                            typeCounts.Improvement++;
                        } else if (t === 'Safety') {
                            months[m].safetyCount++;
                            typeCounts.Safety++;
                        } else {
                            months[m].otherCount++;
                            typeCounts.Other++;
                        }

                        months[m].wos.push({
                            id: wo.id,
                            wo_no: wo.wo_no,
                            created_at: wo.created_at,
                            formatted_date: dt.toLocaleDateString('id-ID'),
                            category: wo.category,
                            type: wo.type,
                            priority: wo.priority,
                            status: wo.status,
                            description: wo.description,
                            equipment_name: wo.equipment ? wo.equipment.name : '-',
                            pic_name: wo.pics && wo.pics.length > 0 ? wo.pics.map(p => p.name).join(', ') : (wo.assignee ? wo.assignee.name : '-')
                        });
                    }
                }
            });

            const totalYear = months.reduce((acc, m) => acc + m.count, 0);
            const totalWo = months.reduce((acc, m) => acc + m.woCount, 0);
            const totalFab = months.reduce((acc, m) => acc + m.fabCount, 0);
            const totalClosed = months.reduce((acc, m) => acc + m.closedCount, 0);
            const totalOpen = months.reduce((acc, m) => acc + m.openCount, 0);

            // Calculate trend: compare recent 2 active months with data or last month vs previous
            const currentMonthIdx = monOrderYear === new Date().getFullYear() ? new Date().getMonth() : 11;
            let trend = 'STABLE';
            let trendDiff = 0;
            if (currentMonthIdx > 0) {
                const curM = months[currentMonthIdx].count;
                const prevM = months[currentMonthIdx - 1].count;
                trendDiff = curM - prevM;
                if (trendDiff > 0) trend = 'UP';
                else if (trendDiff < 0) trend = 'DOWN';
                else trend = 'STABLE';
            }

            const breakdownRatio = totalYear > 0 ? Math.round((typeCounts.Breakdown / totalYear) * 100) : 0;
            const pmrRatio = totalYear > 0 ? Math.round((typeCounts.Preventive / totalYear) * 100) : 0;

            return {
                ...row,
                months,
                totalYear,
                totalWo,
                totalFab,
                totalClosed,
                totalOpen,
                typeCounts,
                breakdownRatio,
                pmrRatio,
                trend,
                trendDiff
            };
        });

        const monthlyOrderTotals = Array(12).fill(null).map((_, mIdx) => {
            let count = 0;
            let woCount = 0;
            let fabCount = 0;
            let closedCount = 0;
            let openCount = 0;
            let preventiveCount = 0;
            let breakdownCount = 0;
            let improvementCount = 0;
            let safetyCount = 0;
            let otherCount = 0;
            let wos = [];

            monthlyOrderMatrix.forEach(row => {
                const m = row.months[mIdx];
                count += m.count;
                woCount += m.woCount;
                fabCount += m.fabCount;
                closedCount += m.closedCount;
                openCount += m.openCount;
                preventiveCount += m.preventiveCount;
                breakdownCount += m.breakdownCount;
                improvementCount += m.improvementCount;
                safetyCount += m.safetyCount;
                otherCount += m.otherCount;
                wos = wos.concat(m.wos);
            });

            return {
                monthIndex: mIdx,
                monthName: monthNamesShort[mIdx],
                monthFullName: monthNamesFull[mIdx],
                count,
                woCount,
                fabCount,
                closedCount,
                openCount,
                preventiveCount,
                breakdownCount,
                improvementCount,
                safetyCount,
                otherCount,
                pmrPct: count > 0 ? Math.round((preventiveCount / count) * 100) : 0,
                bdPct: count > 0 ? Math.round((breakdownCount / count) * 100) : 0,
                wos
            };
        });

        const grandTotalWos = monthlyOrderTotals.reduce((acc, m) => acc + m.count, 0);
        const grandTotalWo = monthlyOrderTotals.reduce((acc, m) => acc + m.woCount, 0);
        const grandTotalFab = monthlyOrderTotals.reduce((acc, m) => acc + m.fabCount, 0);
        const grandTotalClosed = monthlyOrderTotals.reduce((acc, m) => acc + m.closedCount, 0);
        const grandTotalOpen = monthlyOrderTotals.reduce((acc, m) => acc + m.openCount, 0);

        const monthlyOrderMoMGrowth = monthlyOrderTotals.map((m, idx) => {
            if (idx === 0) return { diff: 0, pct: 0, text: '-' };
            const prev = monthlyOrderTotals[idx - 1].count;
            const diff = m.count - prev;
            if (prev === 0) {
                return { diff, pct: m.count > 0 ? 100 : 0, text: m.count > 0 ? '+100%' : '0%' };
            }
            const pct = Math.round((diff / prev) * 100);
            return { diff, pct, text: (pct > 0 ? '+' : '') + pct + '%' };
        });

        const monOrderCategoryCounts = {
            Mechanical: 0,
            Electrical: 0,
            Fabrication: 0,
            Civil: 0,
            Instrument: 0,
            Utility: 0,
            Others: 0
        };
        monthlyOrderWos.forEach(wo => {
            const cat = wo.category || 'Others';
            if (monOrderCategoryCounts[cat] !== undefined) {
                monOrderCategoryCounts[cat]++;
            } else {
                monOrderCategoryCounts.Others = (monOrderCategoryCounts.Others || 0) + 1;
            }
        });

        // 10. Damage Type Breakdown & Trends
        const monOrderTypeCounts = {
            Preventive: 0,
            Breakdown: 0,
            Improvement: 0,
            Safety: 0,
            Other: 0
        };
        monthlyOrderWos.forEach(wo => {
            const t = (wo.type || '').trim();
            if (t === 'Preventive') monOrderTypeCounts.Preventive++;
            else if (t === 'Breakdown' || t === 'Corrective') monOrderTypeCounts.Breakdown++;
            else if (t === 'Improvement') monOrderTypeCounts.Improvement++;
            else if (t === 'Safety') monOrderTypeCounts.Safety++;
            else monOrderTypeCounts.Other++;
        });

        const monthlyOrderTypeTrends = monthlyOrderTotals.map(m => ({
            monthIndex: m.monthIndex,
            monthName: m.monthName,
            monthFullName: m.monthFullName,
            count: m.count,
            preventive: m.preventiveCount,
            breakdown: m.breakdownCount,
            improvement: m.improvementCount,
            safety: m.safetyCount,
            other: m.otherCount,
            pmrPct: m.pmrPct,
            bdPct: m.bdPct
        }));

        let peakMonthObj = { name: '-', count: 0, breakdownCount: 0 };
        monthlyOrderTotals.forEach(m => {
            if (m.count > peakMonthObj.count) {
                peakMonthObj = { name: m.monthFullName, count: m.count, breakdownCount: m.breakdownCount };
            }
        });

        let topStationObj = { name: '-', count: 0 };
        let topBreakdownStationObj = { name: '-', count: 0, ratio: 0, total: 0 };
        monthlyOrderMatrix.forEach(r => {
            if (r.totalYear > topStationObj.count) {
                topStationObj = { name: r.stationName, count: r.totalYear };
            }
            if (r.typeCounts.Breakdown > topBreakdownStationObj.count) {
                topBreakdownStationObj = {
                    name: r.stationName,
                    count: r.typeCounts.Breakdown,
                    ratio: r.breakdownRatio,
                    total: r.totalYear
                };
            }
        });

        const completionRatePct = grandTotalWos > 0 ? Math.round((grandTotalClosed / grandTotalWos) * 100) : 0;
        const pmrRate = grandTotalWos > 0 ? Math.round((monOrderTypeCounts.Preventive / grandTotalWos) * 100) : 0;
        const bdRate = grandTotalWos > 0 ? Math.round((monOrderTypeCounts.Breakdown / grandTotalWos) * 100) : 0;
        const imprRate = grandTotalWos > 0 ? Math.round((monOrderTypeCounts.Improvement / grandTotalWos) * 100) : 0;
        const safetyRate = grandTotalWos > 0 ? Math.round((monOrderTypeCounts.Safety / grandTotalWos) * 100) : 0;

        // 11. Smart Engineering Diagnostic & Recommendations Engine (Monthly vs Full-Year Scope)
        const isMonthlyDiagnosa = (monOrderMonth !== 'ALL' && monOrderMonth >= 0 && monOrderMonth < 12);
        let diagnosaPeriodLabel = `Tahun ${monOrderYear} (1 Tahun Penuh)`;
        let diagnosaShortLabel = `Tahun ${monOrderYear}`;
        let selectedMonthName = '-';
        let selectedMonthShort = '-';

        let diagTotalWos = grandTotalWos;
        let diagTotalClosed = grandTotalClosed;
        let diagTotalOpen = grandTotalOpen;
        let diagCompletionRate = completionRatePct;
        let diagPmrRate = pmrRate;
        let diagBdRate = bdRate;
        let diagPrevCount = monOrderTypeCounts.Preventive;
        let diagBdCount = monOrderTypeCounts.Breakdown;
        let diagImprCount = monOrderTypeCounts.Improvement;
        let diagSafetyCount = monOrderTypeCounts.Safety;
        let diagOtherCount = monOrderTypeCounts.Other;
        let diagTopStation = topStationObj;
        let diagTopBdStation = topBreakdownStationObj;
        let diagMoMGrowth = { diff: 0, pct: 0, text: `Beban kerja puncak berada di bulan ${peakMonthObj.name} (${peakMonthObj.count} WO)` };

        if (isMonthlyDiagnosa) {
            const mIdx = monOrderMonth;
            const selData = monthlyOrderTotals[mIdx];
            selectedMonthName = monthNamesFull[mIdx];
            selectedMonthShort = monthNamesShort[mIdx];
            diagnosaPeriodLabel = `Bulan ${selectedMonthName} ${monOrderYear}`;
            diagnosaShortLabel = `${selectedMonthName} ${monOrderYear}`;

            diagTotalWos = selData.count;
            diagTotalClosed = selData.closedCount;
            diagTotalOpen = selData.openCount;
            diagCompletionRate = selData.count > 0 ? Math.round((selData.closedCount / selData.count) * 100) : 0;
            diagPmrRate = selData.pmrPct;
            diagBdRate = selData.bdPct;
            diagPrevCount = selData.preventiveCount;
            diagBdCount = selData.breakdownCount;
            diagImprCount = selData.improvementCount;
            diagSafetyCount = selData.safetyCount;
            diagOtherCount = selData.otherCount;

            // Month specific station hotspots
            let mTopSt = { name: '-', count: 0 };
            let mTopBdSt = { name: '-', count: 0, ratio: 0, total: 0 };
            monthlyOrderMatrix.forEach(r => {
                const mCell = r.months[mIdx];
                if (mCell.count > mTopSt.count) {
                    mTopSt = { name: r.stationName, count: mCell.count };
                }
                if (mCell.breakdownCount > mTopBdSt.count) {
                    const ratio = mCell.count > 0 ? Math.round((mCell.breakdownCount / mCell.count) * 100) : 0;
                    mTopBdSt = {
                        name: r.stationName,
                        count: mCell.breakdownCount,
                        ratio: ratio,
                        total: mCell.count
                    };
                }
            });
            diagTopStation = mTopSt;
            diagTopBdStation = mTopBdSt;

            // MoM Growth vs Previous Month
            if (mIdx > 0) {
                const prevMData = monthlyOrderTotals[mIdx - 1];
                const prevCount = prevMData.count;
                const diff = selData.count - prevCount;
                if (prevCount === 0) {
                    diagMoMGrowth = { diff, pct: selData.count > 0 ? 100 : 0, text: selData.count > 0 ? `Naik +100% (+${diff} WO dibanding ${monthNamesShort[mIdx - 1]})` : `Sama (0 WO)` };
                } else {
                    const pct = Math.round((diff / prevCount) * 100);
                    if (pct > 0) {
                        diagMoMGrowth = { diff, pct, text: `Beban order naik +${pct}% (+${diff} WO dibanding ${monthNamesShort[mIdx - 1]})` };
                    } else if (pct < 0) {
                        diagMoMGrowth = { diff, pct, text: `Beban order turun ${pct}% (${diff} WO dibanding ${monthNamesShort[mIdx - 1]})` };
                    } else {
                        diagMoMGrowth = { diff, pct, text: `Beban order stabil (Sama dengan ${monthNamesShort[mIdx - 1]}: ${prevCount} WO)` };
                    }
                }
            } else {
                diagMoMGrowth = { diff: 0, pct: 0, text: `Bulan awal tahun operasional (${selectedMonthName})` };
            }
        }

        let healthStatus = 'EXCELLENT';
        let healthTitle = `Proaktif & Terkendali Prima (${diagnosaShortLabel})`;
        let healthBadgeColor = '#10b981';
        let healthBgColor = '#ecfdf5';
        let healthIcon = 'fas fa-circle-check';

        if (diagBdRate > 25 || (diagTotalWos > 0 && diagCompletionRate < 60)) {
            healthStatus = 'CRITICAL';
            healthTitle = `Kritis - Beban Breakdown / Backlog Tinggi (${diagnosaShortLabel})`;
            healthBadgeColor = '#ef4444';
            healthBgColor = '#fef2f2';
            healthIcon = 'fas fa-triangle-exclamation';
        } else if (diagBdRate > 15 || diagPmrRate < 70 || (diagTotalWos > 0 && diagCompletionRate < 75)) {
            healthStatus = 'WARNING';
            healthTitle = `Waspada - Butuh Penajaman PM & Monitoring (${diagnosaShortLabel})`;
            healthBadgeColor = '#f59e0b';
            healthBgColor = '#fffbeb';
            healthIcon = 'fas fa-circle-exclamation';
        }

        const hotspotStationName = diagTopBdStation.count > 0 ? diagTopBdStation.name : (diagTopStation.name !== '-' ? diagTopStation.name : 'Utama Pabrik');
        const hotspotBdCount = diagTopBdStation.count;
        const hotspotRatio = diagTopBdStation.ratio;

        const smartRecommendations = [
            {
                pillar: 'Keandalan Mesin & Mitigasi Stasiun Hotspot',
                pillarCode: 'RELIABILITY',
                icon: 'fas fa-industry',
                color: '#dc2626',
                priority: 'P1 - High Priority',
                priorityClass: 'badge-danger',
                owner: 'Asisten Maintenance & Mill Workshop PIC',
                target: `Stasiun ${hotspotStationName}`,
                problem: isMonthlyDiagnosa
                    ? `Pada ${diagnosaShortLabel}, Stasiun ${hotspotStationName} mencatatkan konsentrasi beban tertinggi di pabrik (${hotspotBdCount > 0 ? hotspotBdCount + ' Breakdown WO (' + hotspotRatio + '% beban stasiun)' : diagTopStation.count + ' Total WO'}).`
                    : `Stasiun ${hotspotStationName} mencatatkan konsentrasi beban tertinggi di pabrik (${hotspotBdCount > 0 ? hotspotBdCount + ' Breakdown WO (' + hotspotRatio + '% beban stasiun)' : topStationObj.count + ' Total WO'}).`,
                action: isMonthlyDiagnosa
                    ? `Segera laksanakan inspeksi mendalam (Deep Condition Assessment) pada komponen bergerak Stasiun ${hotspotStationName}, periksa vibrasi & thermography motor/gearbox, dan ganti part aus sebelum jadwal operasional bulan depan.`
                    : `Lakukan asesmen kondisi menyeluruh (Condition Assessment) pada komponen bergerak (moving parts: shaft, bearing, liner plate, packing, roller chain), evaluasi temperatur & getaran secara berkala (vibration analysis & thermography), serta percepat peremajaan part yang mendekati batas lifetime HM.`,
                standard: 'ISO 14224 & SMRP Standard Failure Mode Mitigation'
            },
            {
                pillar: 'Optimalisasi Preventive & Autonomous Maintenance (TPM Pillar 1 & 2)',
                pillarCode: 'PREVENTIVE',
                icon: 'fas fa-shield-halved',
                color: '#2563eb',
                priority: 'P2 - Medium Priority',
                priorityClass: 'badge-primary',
                owner: 'Asisten Proses & Asisten Maintenance',
                target: 'Seluruh 12 Stasiun Utama Pabrik',
                problem: `Rasio Pemeliharaan Pencegahan (PMR) pada ${diagnosaShortLabel} berada pada ${diagPmrRate}% (Target World-Class PKS $\\ge$ 80% Total WO).`,
                action: isMonthlyDiagnosa
                    ? `Tingkatkan kedisiplinan inspeksi mandiri CILT (Cleaning, Inspection, Lubrication, Tightening) oleh operator proses. Pastikan jadwal PM mingguan di bulan depan terealisasi 100% tepat waktu.`
                    : `Tingkatkan kedisiplinan operator dalam inspeksi harian CILT (Cleaning, Inspection, Lubrication, Tightening) sebelum proses pengolahan. Jadwalkan Overhaul Terencana pada masa low-crop sebelum memasuki bulan beban puncak (${peakMonthObj.name}) untuk mencegah lonjakan breakdown saat throughput TBS tinggi.`,
                standard: 'TPM Autonomous Maintenance (Jishu Hozen) & PM Compliance'
            },
            {
                pillar: 'Manajemen Buffer Stock Sparepart Kritis & Material Readiness',
                pillarCode: 'SUPPLY_CHAIN',
                icon: 'fas fa-boxes-stacked',
                color: '#8b5cf6',
                priority: 'P2 - Medium Priority',
                priorityClass: 'badge-info',
                owner: 'KTU, Gudang & Perencana Pemeliharaan (Planner)',
                target: 'Gudang Material & Bengkel Workshop',
                problem: `Sebanyak ${diagTotalOpen} WO periode ini masih berstatus OPEN (${100 - diagCompletionRate}% belum ditutup/closed).`,
                action: `Lakukan audit fisik ketersediaan suku cadang fast-moving (bearing, packing, liner, filter). Gunakan modul Monthly Plan Material untuk memastikan material 100% siap sebelum servis dieksekusi agar WO dapat segera selesai dan ditutup.`,
                standard: 'Critical Spare Parts Min-Max Inventory Control & Kesiapan Material 100%'
            },
            {
                pillar: 'Root Cause Failure Analysis (RCFA) & Zero Safety Incident',
                pillarCode: 'SAFETY_RCFA',
                icon: 'fas fa-clipboard-check',
                color: '#059669',
                priority: 'P3 - Standard Compliance',
                priorityClass: 'badge-success',
                owner: 'Mill Manager & Tim K3 Pabrik',
                target: 'Tim Engineering & Seluruh Area Operasional',
                problem: `Tercatat ${diagSafetyCount} order Keselamatan (Safety) dan ${diagBdCount} insiden Breakdown pada ${diagnosaShortLabel}.`,
                action: `Terapkan investigasi 5-Why RCFA untuk breakdown kronis guna mengeliminasi akar masalah berulang. Prioritaskan penanganan seluruh order Safety dengan respon cepat demi menjamin Zero Accident dan kepatuhan ISPO/RSPO.`,
                standard: 'RCFA 5-Why Methodology & Sistem Manajemen K3 (SMK3 / ISO 45001 / ISPO)'
            }
        ];

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
                // Monthly Monitoring Order Sub Sheet data
                monOrderYear,
                monOrderMonth,
                isMonthlyDiagnosa,
                diagnosaPeriodLabel,
                diagnosaShortLabel,
                selectedMonthName,
                selectedMonthShort,
                diagTotalWos,
                diagTotalClosed,
                diagTotalOpen,
                diagCompletionRate,
                diagPmrRate,
                diagBdRate,
                diagPrevCount,
                diagBdCount,
                diagImprCount,
                diagSafetyCount,
                diagOtherCount,
                diagTopStation,
                diagTopBdStation,
                diagMoMGrowth,
                monOrderStation,
                monOrderCategory,
                monOrderPrefix,
                monOrderType,
                monthlyOrderMatrix,
                monthlyOrderTotals,
                monthlyOrderMoMGrowth,
                grandTotalWos,
                grandTotalWo,
                grandTotalFab,
                grandTotalClosed,
                grandTotalOpen,
                completionRatePct,
                peakMonthObj,
                topStationObj,
                topBreakdownStationObj,
                monOrderCategoryCounts,
                monOrderTypeCounts,
                monthlyOrderTypeTrends,
                pmrRate,
                bdRate,
                imprRate,
                safetyRate,
                healthStatus,
                healthTitle,
                healthBadgeColor,
                healthBgColor,
                healthIcon,
                smartRecommendations,
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

        const plans = await prisma.weeklyPlan.findMany({
            where: {
                ...where,
                wo: { category: categoryFilter }
            },
            select: {
                id: true,
                planned_week: true,
                planned_day: true,
                wo: {
                    select: {
                        id: true,
                        category: true,
                        description: true,
                        station: { select: { id: true, name: true } },
                        equipment: { select: { id: true, name: true } },
                        pics: { select: { id: true, name: true } }
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
            if (!plan.wo) return;
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
