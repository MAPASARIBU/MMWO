const http = require('http');

function request(method, path, data, cookie) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: method,
            headers: {}
        };

        if (cookie) options.headers['Cookie'] = cookie;
        if (data) {
            options.headers['Content-Type'] = 'application/json';
            options.headers['Content-Length'] = Buffer.byteLength(data);
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
    console.log('--- Frontend Verification ---');

    // 1. Login
    console.log('1. Logging in...');
    const loginData = JSON.stringify({ username: 'admin', password: 'admin123' });
    const loginRes = await request('POST', '/auth/login', loginData);
    const cookie = loginRes.headers['set-cookie'];
    console.log('Login:', loginRes.statusCode);

    // 2. Dashboard
    console.log('2. Fetching Dashboard...');
    const dashRes = await request('GET', '/dashboard', null, cookie);
    console.log('Dashboard:', dashRes.statusCode);
    if (dashRes.body.includes('Welcome, Administrator')) console.log('✓ Content Verified');
    else console.log('✗ Content Mismatch');

    // 3. WO List
    console.log('3. Fetching WO List...');
    const listRes = await request('GET', '/work-orders', null, cookie);
    console.log('WO List:', listRes.statusCode);

    // 4. WO Create Page
    console.log('4. Fetching WO Create Page...');
    const createRes = await request('GET', '/work-orders/create', null, cookie);
    console.log('WO Create:', createRes.statusCode);

    // 5. WO Detail (ID 1)
    console.log('5. Fetching WO Detail (ID 1)...');
    const detailRes = await request('GET', '/work-orders/1', null, cookie);
    console.log('WO Detail:', detailRes.statusCode);

    // 6. Admin Users
    console.log('6. Fetching Admin Users...');
    const usersRes = await request('GET', '/admin/users', null, cookie);
    console.log('Admin Users:', usersRes.statusCode);
    if (usersRes.body.includes('User Management')) console.log('✓ Content Verified');
}

verify().catch(console.error);
