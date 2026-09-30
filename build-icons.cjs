const sharp = require('sharp');
const path = require('node:path');
Promise.all([192, 512].map(size => sharp(path.join(__dirname, 'icon.svg')).resize(size, size).png().toFile(path.join(__dirname, `icon-${size}.png`)))).catch(error => { console.error(error); process.exitCode = 1; });
