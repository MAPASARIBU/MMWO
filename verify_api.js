const http = require('http');

function postRequest(path, data, cookie) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': data.length
            }
        };

        if (cookie) {
            options.headers['Cookie'] = cookie;
        }

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
        });

        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

function getRequest(path, cookie) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: 'GET',
            headers: {
                'Cookie': cookie
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
        });

        req.on('error', reject);
        req.end();
    });
}

async function verify() {
    console.log('1. Logging in...');
    const loginData = JSON.stringify({ username: 'admin', password: 'admin123' });
    const loginRes = await postRequest('/auth/login', loginData);

    // Check for redirect (302)
    if (loginRes.statusCode !== 302) {
        console.error('Login failed, status:', loginRes.statusCode);
        console.error('Body:', loginRes.body);
        return;
    }

    const cookie = loginRes.headers['set-cookie'];
    console.log('Login successful. Cookie:', cookie);

    console.log('2. Fetching Mills...');
    const millsRes = await getRequest('/api/mills', cookie);
    console.log('Mills Status:', millsRes.statusCode);
    console.log('Mills Data:', millsRes.body);

    console.log('3. Fetching Stations...');
    const stationsRes = await getRequest('/api/stations', cookie);
    console.log('Stations Status:', stationsRes.statusCode);
    console.log('Stations Data:', stationsRes.body);
}

verify().catch(console.error);
