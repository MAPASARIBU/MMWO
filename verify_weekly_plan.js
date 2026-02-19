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
    console.log('--- Weekly Plan Route Verification ---');

    // 1. Login
    console.log('1. Logging in...');
    const loginData = JSON.stringify({ username: 'admin', password: 'admin123' });
    const loginRes = await request('POST', '/auth/login', loginData);
    const cookie = loginRes.headers['set-cookie'];
    console.log('Login:', loginRes.statusCode);

    // 2. Fetch Weekly Plan Page
    console.log('2. Fetching Weekly Plan Page...');
    const planRes = await request('GET', '/weekly-plan', null, cookie);
    console.log('Weekly Plan Status:', planRes.statusCode);

    if (planRes.statusCode === 200) {
        console.log('✓ Weekly Plan Page Loaded Successfully');
    } else {
        console.log('✗ Failed to Load Weekly Plan Page');
    }
}

verify().catch(console.error);
