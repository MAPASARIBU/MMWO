const cron = require('node-cron');
const tasksToRun = [];

cron.schedule = (pattern, task) => {
    console.log(`[TEST] Registered cron job. Will execute now...`);
    tasksToRun.push(task);
};

const hmCron = require('./src/cron/hmCron');

async function runNow() {
    hmCron.startHMCron();
    
    console.log('--- TRIGGERING HM CRON MANUALLY ---');
    for (const task of tasksToRun) {
        await task();
    }
    console.log('--- DONE TRIGGERING ---');
    process.exit(0);
}

runNow();
