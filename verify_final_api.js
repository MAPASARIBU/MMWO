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

        if (data) options.headers['Content-Length'] = Buffer.byteLength(data);
        if (cookie) options.headers['Cookie'] = cookie;

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
    console.log('--- Final API Verification ---');

    // 1. Login as Admin
    console.log('1. Logging in as Admin...');
    const loginData = JSON.stringify({ username: 'admin', password: 'admin123' });
    const loginRes = await request('POST', '/auth/login', loginData);
    const cookie = loginRes.headers['set-cookie'];
    console.log('Login:', loginRes.statusCode);

    // 2. Weekly Plan upsert
    console.log('2. Upserting Weekly Plan...');
    const planData = JSON.stringify({
        wo_id: 1, // Created in previous script
        planned_week: '2026-W06',
        planned_day: 'Wednesday'
    });
    const planRes = await request('POST', '/api/weekly-plan', planData, cookie);
    console.log('Plan Upsert:', planRes.statusCode);
    console.log(planRes.body);

    // 3. Admin: Get Users
    console.log('3. Getting Users...');
    const usersRes = await request('GET', '/api/users', null, cookie);
    console.log('Get Users:', usersRes.statusCode);
    console.log('Users count:', JSON.parse(usersRes.body).length);

    // 4. Admin: Create User
    console.log('4. Creating New User...');
    const userData = JSON.stringify({
        username: 'testuser',
        password: 'password123',
        name: 'Test Users',
        role: 'PROC',
        mill_id: 1
    });
    const createRes = await request('POST', '/api/users', userData, cookie);
    console.log('Create User:', createRes.statusCode);
}

verify().catch(console.error);
