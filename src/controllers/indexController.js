const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const getDashboard = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const user = req.session.user;

        // Redirect OPERATOR to Input HM page immediately
        if (user.role === 'OPERATOR') {
            return res.redirect('/input-hm');
        }

        // Mill Handling
        let millId = null;
        let millName = "All Mills";
        let mills = [];

        // Fetch mills based on role
        if (user.role === 'ADMIN') {
            mills = await prisma.mill.findMany({ orderBy: { name: 'asc' } });
        } else if (user.role === 'SENIOR_MANAGER') {
            mills = await prisma.mill.findMany({
                where: { id: { in: user.accessible_mills || [] } },
                orderBy: { name: 'asc' }
            });
        }

        if (user.role === 'ADMIN' || user.role === 'SENIOR_MANAGER') {
            // Allow to select mill via query param
            if (req.query.millId) {
                millId = parseInt(req.query.millId);
                const selectedMill = mills.find(m => m.id === millId);
                if (selectedMill) millName = selectedMill.name;
            } else if (user.current_mill_id) {
                // Default to the mill selected at login
                millId = user.current_mill_id;
                millName = user.current_mill_name || "Unknown Mill";
            }
        } else {
            // Non-admin is locked to their mill
            millId = user.mill_id;
            if (millId) {
                const userMill = await prisma.mill.findUnique({ where: { id: millId } });
                millName = userMill ? userMill.name : "Unknown Mill";
            }
        }

        // Base where clause for general queries (Recent WOs, Stats)
        let baseWhere = {};
        if (millId) {
            baseWhere.mill_id = millId;
        } else if (user.role === 'SENIOR_MANAGER') {
            // If SENIOR_MANAGER and no specific mill is selected, show only accessible mills
            baseWhere.mill_id = { in: user.accessible_mills || [] };
        }

        // Filters
        const { startDate, endDate, status } = req.query;
        let filterWhere = { ...baseWhere };
        const hasFilters = startDate || endDate || status;

        // Date Range Filter
        if (startDate || endDate) {
            filterWhere.created_at = {};
            if (startDate) {
                filterWhere.created_at.gte = new Date(startDate);
            }
            if (endDate) {
                // Set end date to end of day
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                filterWhere.created_at.lte = end;
            }
        }

        // Status Filter
        if (status) {
            if (Array.isArray(status)) {
                filterWhere.status = { in: status };
            } else {
                filterWhere.status = status;
            }
        }

        // Query Options for Recent/Filtered WOs
        let queryOptions = {
            where: filterWhere,
            orderBy: { created_at: 'desc' },
            include: { station: true }
        };

        // If no filters, limit to 5 (original behavior), otherwise show all matching
        if (!hasFilters) {
            queryOptions.take = 5;
        }

        // Fetch recent WOs (filtered by mill and other filters)
        const recentWos = await prisma.workOrder.findMany(queryOptions);

        // Prepare filter info for display (to pre-fill inputs)
        const filterInfo = {
            startDate: startDate || null,
            endDate: endDate || null,
            status: status || null,
        };



        // Stats (Apply Filters - specifically DATE and MILL, but careful with STATUS)
        // We want Date Range to apply to Stats, but NOT the dashboard "Status" filter 
        // because "Pending" and "High Priority" define their own status criteria.
        let statsWhere = { ...baseWhere };
        if (filterWhere.created_at) {
            statsWhere.created_at = filterWhere.created_at;
        }

        const totalWOs = await prisma.workOrder.count({ where: statsWhere });
        const completedWos = await prisma.workOrder.count({
            where: {
                ...statsWhere,
                status: { in: ['COMPLETED', 'VERIFIED', 'CLOSED'] }
            }
        });
        const realCompletionRate = totalWOs > 0 ? Math.round((completedWos / totalWOs) * 100) : 0;

        const stats = {
            pending: await prisma.workOrder.count({
                where: {
                    ...statsWhere,
                    status: { in: ['OPEN', 'PLANNED', 'ASSIGNED', 'IN_PROGRESS'] }
                }
            }),
            completionRate: realCompletionRate,
            highPriority: await prisma.workOrder.count({
                where: {
                    ...statsWhere,
                    priority: 'P1',
                    status: { not: 'CLOSED' }
                }
            })
        };

        // Chart Data Aggregation
        const typeStats = await prisma.workOrder.groupBy({
            by: ['type'],
            where: filterWhere, // Use filterWhere to respect date/status filters
            _count: { type: true }
        });

        const categoryStats = await prisma.workOrder.groupBy({
            by: ['category'],
            where: filterWhere, // Use filterWhere to respect date/status filters
            _count: { category: true }
        });

        // Chart Data for WO by Station
        const stationCounts = await prisma.workOrder.groupBy({
            by: ['station_id'],
            where: filterWhere,
            _count: { id: true }
        });

        // Fetch station names for mapping
        let statStations = await prisma.station.findMany({
            where: millId ? { mill_id: millId } : {}
        });
        
        const stationMap = {};
        statStations.forEach(s => {
            stationMap[s.id] = s.name;
        });

        const stationChartData = {
            labels: [],
            data: []
        };
        
        stationCounts.forEach(sc => {
            if (sc.station_id) {
                stationChartData.labels.push(stationMap[sc.station_id] || 'Unknown');
                stationChartData.data.push(sc._count.id);
            }
        });

        // Parts that need attention (Warning > 90% or Critical >= 100%)
        // --- DATA AGGREGATION FOR DASHBOARD TABLES ---
        const allWosForTables = await prisma.workOrder.findMany({
            where: filterWhere,
            select: {
                id: true,
                status: true,
                category: true,
                description: true,
                created_at: true,
                completed_at: true,
                closed_at: true,
                parts: { select: { id: true } }
            }
        });

        const maintenanceTable = {
            hmBase: { total: 0, open: 0, inProgress: 0, completeClose: 0, assigned: 0, onHold: 0 },
            autoPm: { total: 0, open: 0, inProgress: 0, completeClose: 0, assigned: 0, onHold: 0 },
            mechCivilEtc: { total: 0, open: 0, inProgress: 0, completeClose: 0, assigned: 0, onHold: 0 },
            electInst: { total: 0, open: 0, inProgress: 0, completeClose: 0, assigned: 0, onHold: 0 }
        };

        const processingTable = {
            manualProcessing: { total: 0, open: 0, inProgress: 0, completeClose: 0, assigned: 0, onHold: 0 }
        };

        const statusTableDetails = {
            open: {},
            inProgress: {},
            completeClose: {},
            assigned: {},
            onHold: {}
        };

        const durationTable = {
            under3: 0,
            days4to7: 0,
            days8to14: 0,
            over14: 0
        };

        const durationDetails = {
            under3: {},
            days4to7: {},
            days8to14: {},
            over14: {}
        };

        const outstandingDurationTable = {
            under3: 0,
            days4to7: 0,
            days8to14: 0,
            over14: 0
        };

        const outstandingDurationDetails = {
            under3: {},
            days4to7: {},
            days8to14: {},
            over14: {}
        };

        const mapStatus = (status) => {
            if (status === 'OPEN') return 'open';
            if (status === 'PLANNED' || status === 'ASSIGNED') return 'assigned';
            if (status === 'IN_PROGRESS') return 'inProgress';
            if (status === 'COMPLETED' || status === 'VERIFIED' || status === 'CLOSED') return 'completeClose';
            if (status === 'ON_HOLD') return 'onHold';
            return null;
        };

        allWosForTables.forEach(wo => {
            const st = mapStatus(wo.status);
            
            let assignedRow = null;
            const cat = wo.category || 'Unknown';

            if (st && statusTableDetails[st]) {
                statusTableDetails[st][cat] = (statusTableDetails[st][cat] || 0) + 1;
            }

            if (wo.category === 'Processing') {
                assignedRow = processingTable.manualProcessing;
            } else {
                if (wo.parts && wo.parts.length > 0) {
                    assignedRow = maintenanceTable.hmBase;
                } else if (wo.description && (wo.description.includes('[AUTO PM]') || wo.description.includes('[MANUAL PM]') || wo.description.includes('Periodic Maintenance'))) {
                    assignedRow = maintenanceTable.autoPm;
                } else if (['Mechanical', 'Utility', 'Others', 'Civil', 'Fabrication', 'FAB'].includes(wo.category)) {
                    assignedRow = maintenanceTable.mechCivilEtc;
                } else if (['Electrical', 'Instrument'].includes(wo.category)) {
                    assignedRow = maintenanceTable.electInst;
                }
            }

            if (assignedRow) {
                assignedRow.total++;
                if (st) {
                    assignedRow[st]++;
                }
            }

            // Duration calculation
            if (wo.status === 'COMPLETED' || wo.status === 'VERIFIED' || wo.status === 'CLOSED') {
                const endTime = wo.closed_at || wo.completed_at || wo.updated_at;
                if (endTime && wo.created_at) {
                    const diffTime = Math.abs(new Date(endTime) - new Date(wo.created_at));
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
                    const cat = wo.category || 'Unknown';
                    
                    if (diffDays <= 3) {
                        durationTable.under3++;
                        durationDetails.under3[cat] = (durationDetails.under3[cat] || 0) + 1;
                    }
                    else if (diffDays >= 4 && diffDays <= 7) {
                        durationTable.days4to7++;
                        durationDetails.days4to7[cat] = (durationDetails.days4to7[cat] || 0) + 1;
                    }
                    else if (diffDays >= 8 && diffDays <= 14) {
                        durationTable.days8to14++;
                        durationDetails.days8to14[cat] = (durationDetails.days8to14[cat] || 0) + 1;
                    }
                    else {
                        durationTable.over14++;
                        durationDetails.over14[cat] = (durationDetails.over14[cat] || 0) + 1;
                    }
                }
            } else {
                // Outstanding WO calculation
                if (wo.created_at) {
                    const diffTime = Math.abs(new Date() - new Date(wo.created_at));
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
                    const cat = wo.category || 'Unknown';
                    
                    if (diffDays <= 3) {
                        outstandingDurationTable.under3++;
                        outstandingDurationDetails.under3[cat] = (outstandingDurationDetails.under3[cat] || 0) + 1;
                    }
                    else if (diffDays >= 4 && diffDays <= 7) {
                        outstandingDurationTable.days4to7++;
                        outstandingDurationDetails.days4to7[cat] = (outstandingDurationDetails.days4to7[cat] || 0) + 1;
                    }
                    else if (diffDays >= 8 && diffDays <= 14) {
                        outstandingDurationTable.days8to14++;
                        outstandingDurationDetails.days8to14[cat] = (outstandingDurationDetails.days8to14[cat] || 0) + 1;
                    }
                    else {
                        outstandingDurationTable.over14++;
                        outstandingDurationDetails.over14[cat] = (outstandingDurationDetails.over14[cat] || 0) + 1;
                    }
                }
            }
        });
        // --- END DATA AGGREGATION ---

        res.render('layout', {
            title: 'Dashboard',
            body: await renderView('dashboard', {
                recentWos,
                stats,
                typeStats,
                categoryStats,
                stationChartData,
                mills,
                selectedMillId: millId,
                user, // Pass user for role check
                hasFilters,
                filterInfo,
                maintenanceTable,
                processingTable,
                durationTable,
                durationDetails,
                outstandingDurationTable,
                outstandingDurationDetails,
                statusTableDetails
            }),
            user: req.session.user,
            path: '/dashboard'
        });
    } catch (error) {
        console.error("DASHBOARD RENDER ERROR:", error);
        res.status(500).send('Error loading dashboard: ' + error.message);
    }
};

const getPrintRecap = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const user = req.session.user;

        // Mill Handling
        let millId = null;
        let millName = "All Mills";

        if (user.role === 'ADMIN' || user.role === 'SENIOR_MANAGER') {
            if (req.query.millId) {
                millId = parseInt(req.query.millId);
                const tm = await prisma.mill.findUnique({ where: { id: millId } });
                if (tm) millName = tm.name;
            } else if (user.current_mill_id) {
                millId = user.current_mill_id;
                millName = user.current_mill_name || "Unknown Mill";
            }
        } else {
            millId = user.mill_id;
            if (millId) {
                const tm = await prisma.mill.findUnique({ where: { id: millId } });
                millName = tm ? tm.name : "Unknown Mill";
            }
        }

        // Filters
        const { startDate, endDate, status } = req.query;
        let whereClause = {};

        // Apply Mill Filter
        if (millId) {
            whereClause.mill_id = millId;
        } else if (user.role === 'SENIOR_MANAGER') {
            whereClause.mill_id = { in: user.accessible_mills || [] };
        }

        // Date Range Filter
        if (startDate || endDate) {
            whereClause.created_at = {};
            if (startDate) {
                whereClause.created_at.gte = new Date(startDate);
            }
            if (endDate) {
                // Set end date to end of day
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                whereClause.created_at.lte = end;
            }
        }

        // Status Filter
        if (status) {
            if (Array.isArray(status)) {
                whereClause.status = { in: status };
            } else {
                whereClause.status = status;
            }
        }

        // Category Filter
        const { category } = req.query;
        if (category) {
            if (Array.isArray(category)) {
                whereClause.category = { in: category };
            } else {
                whereClause.category = category;
            }
        }

        // Fetch WOs based on filters (or recent if no filters for consistency, 
        // but user likely wants 'all' matching filters, so we remove 'take' limitation if filters exist)

        let queryOptions = {
            where: whereClause,
            orderBy: { created_at: 'desc' },
            include: { station: true }
        };

        // If no filters are applied, default to recent 20 to avoid dumping everything
        const hasFilters = startDate || endDate || status;
        if (!hasFilters) {
            queryOptions.take = 20;
        }

        const filteredWos = await prisma.workOrder.findMany(queryOptions);

        // Fetch assigned WOs for current user (Keep this separate as 'My Tasks' might be independent of general search, 
        // OR we apply same filters? User request implies "rekap wo" which is general.
        // Let's filter 'Assigned WOs' with the SAME filters too if they exist, otherwise default pending.

        let assignedWhere = {
            assignee_id: userId,
            status: { not: 'CLOSED' }
        };

        if (hasFilters) {
            // Apply date/status filters to assigned too if desired? 
            // Usually "My Assigned Pending" is a specific list. 
            // The request says "pilih beberapa hari tertentu dan memilih sesuai progress wo".
            // It sounds like a general report.
            // Let's keep 'Filtered WOs' as the main list. 
            // And 'Assigned' can stay as 'My Current Actionable Items' unless filters override it?
            // Simpler: Just render ONE main table if filters are applied, or keep 2 sections.
            // Let's pass the filtered list as 'recentWos' (renamed to 'workOrders' in view ideally, but keeping variable name for less refactor).
        }

        const assignedWos = await prisma.workOrder.findMany({
            where: assignedWhere,
            include: { station: true },
            orderBy: { priority: 'asc' }
        });

        const totalWOs = await prisma.workOrder.count({ where: whereClause });
        const completedWos = await prisma.workOrder.count({
            where: {
                ...whereClause,
                status: { in: ['COMPLETED', 'CLOSED'] }
            }
        });
        const realCompletionRate = totalWOs > 0 ? Math.round((completedWos / totalWOs) * 100) : 0;

        const stats = {
            pending: await prisma.workOrder.count({ where: { ...whereClause, status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS'] } } }),
            completionRate: realCompletionRate,
            highPriority: await prisma.workOrder.count({ where: { ...whereClause, priority: 'P1', status: { not: 'CLOSED' } } })
        };

        const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        // Prepare filter info for display
        const filterInfo = {
            startDate: startDate ? new Date(startDate).toLocaleDateString() : null,
            endDate: endDate ? new Date(endDate).toLocaleDateString() : null,
            status: status ? (Array.isArray(status) ? status.join(', ') : status) : 'All',
            category: category ? (Array.isArray(category) ? category.join(', ') : category) : 'All'
        };

        res.render('dashboard_print', {
            recentWos: filteredWos, // This will now contain the filtered result
            assignedWos,
            stats,
            user,
            today,
            filterInfo,
            hasFilters,
            millName // Pass dynamic mill name
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading print view');
    }
};

// Helper to render body partial
const ejs = require('ejs');
const path = require('path');

const renderView = (viewName, data) => {
    return new Promise((resolve, reject) => {
        ejs.renderFile(path.join(__dirname, `../../views/${viewName}.ejs`), data, (err, str) => {
            if (err) reject(err);
            else resolve(str);
        });
    });
};

module.exports = {
    getDashboard,
    getPrintRecap,
    renderView // Exporting helper for other controllers if needed
};
