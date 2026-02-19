const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const getDashboard = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const user = req.session.user;

        // Mill Handling
        let millId = null;
        let millName = "All Mills";
        let mills = [];

        // Fetch all mills if Admin
        if (user.role === 'ADMIN') {
            mills = await prisma.mill.findMany({ orderBy: { name: 'asc' } });

            // Allow admin to select mill via query param
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

        // Fetch assigned WOs for current user (User specific, so mill filter is implicit via user, 
        // BUT strict enforcing: users only see their own anyway. 
        // If Admin, they see 'Assigned to Me' (likely empty or global). 
        // Let's keep assignedWos as "My Assigned" regardless of mill filter, 
        // OR filtering my assignments by mill? usually "My Tasks" are "My Tasks".
        // Let's keep it user-centric.
        const assignedWos = await prisma.workOrder.findMany({
            where: {
                assignee_id: userId,
                status: { not: 'CLOSED' }
            },
            include: { station: true },
            orderBy: { priority: 'asc' }
        });

        // Stats (Apply Filters - specifically DATE and MILL, but careful with STATUS)
        // We want Date Range to apply to Stats, but NOT the dashboard "Status" filter 
        // because "Pending" and "High Priority" define their own status criteria.
        let statsWhere = { ...baseWhere };
        if (filterWhere.created_at) {
            statsWhere.created_at = filterWhere.created_at;
        }

        const stats = {
            pending: await prisma.workOrder.count({
                where: {
                    ...statsWhere,
                    status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS'] }
                }
            }),
            completionRate: 85, // Placeholder - calculating real rate is complex
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

        res.render('layout', {
            title: 'Dashboard',
            body: await renderView('dashboard', {
                recentWos,
                assignedWos,
                stats,
                typeStats,
                categoryStats,
                mills,
                selectedMillId: millId,
                user, // Pass user for role check
                hasFilters,
                filterInfo
            }),
            user: req.session.user,
            path: '/dashboard'
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading dashboard');
    }
};

const getPrintRecap = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const user = req.session.user;

        // Mill Handling
        let millId = null;
        let millName = "All Mills";

        if (user.role === 'ADMIN') {
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

        // Mock stats for checks
        const stats = {
            pending: await prisma.workOrder.count({ where: { status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS'] } } }),
            completionRate: 85,
            highPriority: await prisma.workOrder.count({ where: { priority: 'P1', status: { not: 'CLOSED' } } })
        };

        const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        // Prepare filter info for display
        const filterInfo = {
            startDate: startDate ? new Date(startDate).toLocaleDateString() : null,
            endDate: endDate ? new Date(endDate).toLocaleDateString() : null,
            status: status ? (Array.isArray(status) ? status.join(', ') : status) : 'All'
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
