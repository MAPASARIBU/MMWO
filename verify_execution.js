const http = require('http');

function request(method, path, data, cookie) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: method,
            headers: { 'Content-Type': 'application/json' }
        };
        if (cookie) options.headers['Cookie'] = cookie;
        if (data) options.headers['Content-Length'] = Buffer.byteLength(data);

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

async function verify() {
    console.log('--- Maintenance Flow Verification ---');

    // 1. Login Admin
    const loginData = JSON.stringify({ username: 'admin', password: 'admin123' });
    const loginRes = await request('POST', '/auth/login', loginData);
    const cookie = loginRes.headers['set-cookie'];
    console.log('Login Admin:', loginRes.statusCode);

    // 2. Create WO
    const woData = JSON.stringify({
        mill_id: 1, station_id: 1, category: 'Mechanical', type: 'Breakdown', priority: 'P2', description: 'Pump failure'
    });
    const createRes = await request('POST', '/api/work-orders', woData, cookie);
    const wo = JSON.parse(createRes.body);
    console.log('Created WO:', wo.id, wo.wo_no);

    // 3. Assign WO (Admin assigns to self/someone)
    const assignData = JSON.stringify({ status: 'ASSIGNED', assignee_id: 1 }); // Assign to admin for simplicity
    await request('PATCH', `/api/work-orders/${wo.id}/status`, assignData, cookie);
    console.log('Assigned WO');

    // 4. Start Work
    const startData = JSON.stringify({ status: 'IN_PROGRESS' });
    await request('PATCH', `/api/work-orders/${wo.id}/status`, startData, cookie);
    console.log('Started Work');

    // 5. Complete Work
    const completeData = JSON.stringify({ status: 'COMPLETED', comment: 'ACTION TAKEN: Replaced seal.' });
    const compRes = await request('PATCH', `/api/work-orders/${wo.id}/status`, completeData, cookie);
    console.log('Completed WO:', compRes.statusCode);

    // 6. Verify Comment
    const getRes = await request('GET', `/api/work-orders/${wo.id}`, null, cookie);
    const finalWo = JSON.parse(getRes.body);
    const hasComment = finalWo.comments.some(c => c.comment.includes('Replaced seal'));
    console.log('Start Time:', finalWo.started_at);
    console.log('End Time:', finalWo.completed_at);
    console.log('Action Taken Recorded:', hasComment);

    if (finalWo.status === 'COMPLETED' && hasComment) console.log('✓ Maintenance Flow Verified');
}

verify().catch(console.error);
