const fs = require('fs');

let weekly = fs.readFileSync('views/weeklyPlan.ejs', 'utf-8');
weekly = weekly.replace(/typeof isCivil !== 'undefined' && isCivil \? 'Civil Weekly Plan' : 'Weekly Plan'/g, "typeof isCivil !== 'undefined' && isCivil ? 'Civil Weekly Plan' : (typeof isOffice !== 'undefined' && isOffice ? 'Office Weekly Plan' : 'Weekly Plan')");
weekly = weekly.replace(/typeof isCivil !== 'undefined' && isCivil \? 'Civil Weekly Plan' : 'Maintenance Weekly Plan'/g, "typeof isCivil !== 'undefined' && isCivil ? 'Civil Weekly Plan' : (typeof isOffice !== 'undefined' && isOffice ? 'Office Weekly Plan' : 'Maintenance Weekly Plan')");
weekly = weekly.replace(/'\/weekly-plan\/civil' : '\/weekly-plan'/g, "'/weekly-plan/civil' : (typeof isOffice !== 'undefined' && isOffice ? '/weekly-plan/office' : '/weekly-plan')");
weekly = weekly.replace(/'\/weekly-plan\/civil\/print' : '\/weekly-plan\/print'/g, "'/weekly-plan/civil/print' : (typeof isOffice !== 'undefined' && isOffice ? '/weekly-plan/office/print' : '/weekly-plan/print')");
weekly = weekly.replace(/isCivil === 'undefined' \|\| !isCivil/g, "isCivil === 'undefined' || !isCivil) && (typeof isOffice === 'undefined' || !isOffice");
fs.writeFileSync('views/weeklyPlan.ejs', weekly);

let print = fs.readFileSync('views/weekly_plan_print.ejs', 'utf-8');
print = print.replace(/typeof isCivil !== 'undefined' && isCivil \? 'Civil Weekly Plan' : 'Maintenance Weekly Plan'/g, "typeof isCivil !== 'undefined' && isCivil ? 'Civil Weekly Plan' : (typeof isOffice !== 'undefined' && isOffice ? 'Office Weekly Plan' : 'Maintenance Weekly Plan')");
fs.writeFileSync('views/weekly_plan_print.ejs', print);

console.log('Patch complete.');
