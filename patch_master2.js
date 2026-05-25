const fs = require('fs');
let code = fs.readFileSync('views/admin/master.ejs', 'utf-8');

if (code.includes('<h3>Office Plan Schedules</h3>')) {
    console.log('Already added');
    process.exit(0);
}

const officeTableHTML = `
    <!-- Office Plans Section -->
    <hr class="my-4">
    <div class="flex justify-between items-center mb-3">
        <h3>Office Plan Schedules</h3>
        <% if (['ADMIN', 'MANAGER', 'SENIOR_MANAGER', 'OAA'].includes(user.role)) { %>
            <button class="btn btn-primary" onclick="openOfficeAddModal()">+ Add Schedule</button>
        <% } %>
    </div>

    <div class="table-responsive">
        <table class="table" id="officePlansTable">
            <thead>
                <tr>
                    <th>Mill</th>
                    <th>Station</th>
                    <th>Name</th>
                    <th>Interval</th>
                    <th>Next Due Date</th>
                    <th>Status</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                <% if (typeof officePlans !== 'undefined' && officePlans.length > 0) { %>
                    <% officePlans.forEach(plan => { %>
                        <tr>
                            <td><%= plan.mill.name %></td>
                            <td><%= plan.station.name %></td>
                            <td><%= plan.name %></td>
                            <td><%= plan.interval_value %> <%= plan.interval_type %>(s)</td>
                            <td><%= plan.next_due_date ? plan.next_due_date.toISOString().split('T')[0] : '-' %></td>
                            <td>
                                <% if (plan.is_active) { %>
                                    <span class="badge badge-success">Active</span>
                                <% } else { %>
                                    <span class="badge badge-secondary">Inactive</span>
                                <% } %>
                            </td>
                            <td>
                                <% if (['ADMIN', 'MANAGER', 'SENIOR_MANAGER', 'OAA'].includes(user.role)) { %>
                                    <button class="btn btn-sm btn-info text-white" onclick='openOfficeEditModal(<%- JSON.stringify(plan) %>)'>Edit</button>
                                    <button class="btn btn-sm btn-danger text-white" onclick="deleteOfficePlan(<%= plan.id %>)">Delete</button>
                                <% } %>
                            </td>
                        </tr>
                    <% }) %>
                <% } else { %>
                    <tr>
                        <td colspan="7" class="text-center text-muted">No office plans found.</td>
                    </tr>
                <% } %>
            </tbody>
        </table>
    </div>
`;

// Insert after the end of Processing Plans table:
// </table>\r\n    </div>\r\n\r\n</div>\r\n\r\n<!-- Modal Create / Edit Processing Plan -->
code = code.replace(/(<\/div>\s*<\/div>\s*<!-- Modal Create \/ Edit Processing Plan -->)/, "</div>\n" + officeTableHTML + "\n$1");

fs.writeFileSync('views/admin/master.ejs', code);
console.log('Table injected');
