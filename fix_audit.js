const fs = require('fs');
let c = fs.readFileSync('src/controllers/workOrderController.js', 'utf8');
c = c.replace(/details: `Added/g, 'new_value: `Added');
c = c.replace(/details: `Removed/g, 'new_value: `Removed');
fs.writeFileSync('src/controllers/workOrderController.js', c);
console.log('done');
