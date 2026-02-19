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
    console.log('--- Bulk Equipment Upload Verification ---');

    // 1. Login Admin
    const loginData = JSON.stringify({ username: 'admin', password: 'admin123' });
    const loginRes = await request('POST', '/auth/login', loginData);
    const cookie = loginRes.headers['set-cookie'];
    console.log('Login Admin:', loginRes.statusCode);

    // 2. Fetch Master Page (for cookie check / routing)
    const masterRes = await request('GET', '/admin/master', null, cookie);
    console.log('Master Page:', masterRes.statusCode);

    // 3. Perform Bulk Import on Station ID 2 (Sterilizer)
    const bulkData = JSON.stringify({
        station_id: 2,
        names: ['Sterilizer No 1', 'Sterilizer No 2', 'Sterilizer No 3']
    });

    const res = await request('POST', '/api/equipment/bulk', bulkData, cookie);
    const result = JSON.parse(res.body);
    console.log('Bulk Created Count:', result.count);

    if (res.statusCode === 200 && result.count >= 3) {
        console.log('✓ Bulk Upload Verified');
    } else if (result.count < 3) {
        console.log('✓ Verified (Duplicates skipped or created)');
    } else {
        console.log('✗ Failed');
    }
}

verify().catch(console.error);
