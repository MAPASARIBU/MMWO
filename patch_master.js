const fs = require('fs');
let code = fs.readFileSync('views/admin/master.ejs', 'utf-8');

// 1. Add Office Plan Schedules Table
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

code = code.replace('</div>\n\n<!-- Modal Create / Edit Processing Plan -->', '</div>\n' + officeTableHTML + '\n<!-- Modal Create / Edit Processing Plan -->');

// 2. Add Office Modal
const officeModalHTML = `
<!-- Modal Create / Edit Office Plan -->
<div id="officePlanModal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index: 1000;">
    <div class="card" style="margin: 50px auto; max-width: 500px; position:relative;">
        <h3 id="officeModalTitle">Add Office Plan</h3>
        <form id="officePlanForm">
            <input type="hidden" id="officePlanId" name="id">
            
            <% if (user.role === 'ADMIN') { %>
                <div class="form-group">
                    <label class="form-label">Mill *</label>
                    <select name="mill_id" id="officeMillId" class="form-control" required onchange="filterOfficeStations(this.value)">
                        <option value="">-- Select Mill --</option>
                        <% mills.forEach(m => { %>
                            <option value="<%= m.id %>"><%= m.name %></option>
                        <% }) %>
                    </select>
                </div>
            <% } else { %>
                <input type="hidden" name="mill_id" id="officeMillId" value="<%= user.mill_id %>">
            <% } %>

            <div class="form-group">
                <label class="form-label">Station *</label>
                <select name="station_id" id="officeStationId" class="form-control" required>
                    <option value="">-- Select Station --</option>
                    <% mills.forEach(m => { %>
                        <% m.stations.forEach(s => { %>
                            <option value="<%= s.id %>" data-mill="<%= s.mill_id %>"><%= s.name %></option>
                        <% }) %>
                    <% }) %>
                </select>
            </div>

            <div class="form-group">
                <label class="form-label">Name / Description *</label>
                <input type="text" name="name" id="officePlanName" class="form-control" required placeholder="e.g. Office Weekly Cleaning">
            </div>

            <div class="flex gap-4">
                <div class="form-group flex-grow">
                    <label class="form-label">Interval Value *</label>
                    <input type="number" name="interval_value" id="officeIntervalValue" class="form-control" required min="1" value="1">
                </div>
                <div class="form-group flex-grow">
                    <label class="form-label">Interval Type *</label>
                    <select name="interval_type" id="officeIntervalType" class="form-control" required>
                        <option value="Weekly">Weekly</option>
                        <option value="Monthly">Monthly</option>
                        <option value="Quarterly">Quarterly</option>
                        <option value="Semesterly">Semesterly</option>
                        <option value="Annually">Annually</option>
                    </select>
                </div>
            </div>

            <div class="form-group">
                <label class="form-label">First / Next Due Date *</label>
                <input type="date" name="next_due_date" id="officeNextDueDate" class="form-control" required>
            </div>

            <div class="form-group" id="officeStatusGroup" style="display: none;">
                <label class="form-label">Status</label>
                <select name="is_active" id="officeIsActive" class="form-control">
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                </select>
            </div>

            <div class="flex justify-between mt-4">
                <button type="button" class="btn btn-secondary" onclick="closeOfficePlanModal()">Cancel</button>
                <button type="submit" class="btn btn-primary" id="saveOfficePlanBtn">Save</button>
            </div>
        </form>
    </div>
</div>
`;

code = code.replace('<script>\n    function showMillStations', officeModalHTML + '\n<script>\n    function showMillStations');

// 3. Add Office Script
const officeScriptHTML = `
    // --- Office Plan Scripts ---
    function filterOfficeStations(millId) {
        const stationSelect = document.getElementById('officeStationId');
        const options = stationSelect.querySelectorAll('option[data-mill]');
        let firstValid = null;
        
        options.forEach(opt => {
            if (millId === '' || opt.getAttribute('data-mill') === millId) {
                opt.style.display = '';
                if (!firstValid) firstValid = opt.value;
            } else {
                opt.style.display = 'none';
            }
        });
        
        stationSelect.value = firstValid || '';
    }

    <% if (user.role === 'ADMIN') { %>
        document.addEventListener('DOMContentLoaded', () => {
            const millSelect = document.getElementById('officeMillId');
            if(millSelect && millSelect.value) filterOfficeStations(millSelect.value);
        });
    <% } %>

    function openOfficeAddModal() {
        document.getElementById('officeModalTitle').innerText = 'Add Office Plan';
        document.getElementById('officePlanForm').reset();
        document.getElementById('officePlanId').value = '';
        document.getElementById('officeStatusGroup').style.display = 'none';
        
        <% if (user.role === 'ADMIN') { %>
            filterOfficeStations(document.getElementById('officeMillId').value);
        <% } %>

        document.getElementById('officePlanModal').style.display = 'block';
    }

    function openOfficeEditModal(plan) {
        document.getElementById('officeModalTitle').innerText = 'Edit Office Plan';
        document.getElementById('officePlanId').value = plan.id;
        
        const millEl = document.getElementById('officeMillId');
        if (millEl && millEl.tagName === 'SELECT') {
            millEl.value = plan.mill_id;
            filterOfficeStations(plan.mill_id.toString());
        }

        document.getElementById('officeStationId').value = plan.station_id;
        document.getElementById('officePlanName').value = plan.name;
        document.getElementById('officeIntervalValue').value = plan.interval_value;
        document.getElementById('officeIntervalType').value = plan.interval_type;
        
        const dateStr = new Date(plan.next_due_date).toISOString().split('T')[0];
        document.getElementById('officeNextDueDate').value = dateStr;
        
        document.getElementById('officeIsActive').value = plan.is_active ? 'true' : 'false';
        document.getElementById('officeStatusGroup').style.display = 'block';
        
        document.getElementById('officePlanModal').style.display = 'block';
    }

    function closeOfficePlanModal() {
        document.getElementById('officePlanModal').style.display = 'none';
    }

    document.getElementById('officePlanForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('officePlanId').value;
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());

        const method = id ? 'PUT' : 'POST';
        const url = id ? '/office-plans/' + id : '/office-plans';

        document.getElementById('saveOfficePlanBtn').disabled = true;

        try {
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (res.ok) {
                window.location.reload();
            } else {
                const err = await res.json();
                alert(err.error || 'Failed to save plan');
                document.getElementById('saveOfficePlanBtn').disabled = false;
            }
        } catch (error) {
            console.error(error);
            alert('Error connecting to server.');
            document.getElementById('saveOfficePlanBtn').disabled = false;
        }
    });

    async function deleteOfficePlan(id) {
        if (!confirm('Are you sure you want to delete this office plan schedule?')) return;
        
        try {
            const res = await fetch('/office-plans/' + id, { method: 'DELETE' });
            if (res.ok) {
                window.location.reload();
            } else {
                const err = await res.json();
                alert(err.error || 'Failed to delete');
            }
        } catch (error) {
            console.error(error);
            alert('Error connecting to server');
        }
    }
`;

code = code.replace('</script>', officeScriptHTML + '\n</script>');

fs.writeFileSync('views/admin/master.ejs', code);
console.log('Patch complete.');
