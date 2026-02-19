const http = require('http');

function request(method, path, data, cookie) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (data) {
            options.headers['Content-Length'] = Buffer.byteLength(data);
        }

        if (cookie) {
            options.headers['Cookie'] = cookie;
        }

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
    console.log('--- MM WO API Verification ---');

    // 1. Login
    console.log('1. Logging in as Admin...');
    const loginData = JSON.stringify({ username: 'admin', password: 'admin123' });
    const loginRes = await request('POST', '/auth/login', loginData);
    const cookie = loginRes.headers['set-cookie'];
    console.log('Login Status:', loginRes.statusCode);

    // 2. Create WO
    console.log('2. Creating Work Order...');
    const woData = JSON.stringify({
        mill_id: 1,
        station_id: 1,
        equipment_id: 1,
        category: 'Mechanical',
        type: 'Breakdown',
        priority: 'P1',
        description: 'Valve stuck open'
    });

    const createRes = await request('POST', '/api/work-orders', woData, cookie);
    console.log('Create WO Status:', createRes.statusCode);
    const wo = JSON.parse(createRes.body);
    console.log('WO Created:', wo.wo_no, 'ID:', wo.id);

    const woId = wo.id;

    // 3. Get WO Detail
    console.log(`3. Getting WO Detail for ID ${woId}...`);
    const getRes = await request('GET', `/api/work-orders/${woId}`, null, cookie);
    console.log('Get WO Status:', getRes.statusCode);
    console.log('WO Status in DB:', JSON.parse(getRes.body).status);

    // 4. Update Status (Assign)
    console.log('4. Assigning WO...');
    const assignData = JSON.stringify({
        status: 'ASSIGNED',
        assignee_id: 3 // mtc user
    });
    const updateRes = await request('PATCH', `/api/work-orders/${woId}/status`, assignData, cookie);
    console.log('Update Status:', updateRes.statusCode);
    console.log('New Status:', JSON.parse(updateRes.body).status);

    // 5. Add Comment
    console.log('5. Adding Comment...');
    const commentData = JSON.stringify({
        comment: 'Please check urgent.'
    });
    const commentRes = await request('POST', `/api/work-orders/${woId}/comments`, commentData, cookie);
    console.log('Comment Status:', commentRes.statusCode);

    // 6. Verify Audit Log
    console.log('6. Verifying Audit Log...');
    const finalRes = await request('GET', `/api/work-orders/${woId}`, null, cookie);
    const finalWo = JSON.parse(finalRes.body);
    console.log('Audit Logs Count:', finalWo.audit_logs.length);
    console.log('Latest Action:', finalWo.audit_logs[0].action);
}

verify().catch(console.error);
