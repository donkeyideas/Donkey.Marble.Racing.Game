const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const PRODUCTS = [
  { id: 'starter', coins: '1,000', icon: '$', color: '#ffc220', bg: 'rgba(255,194,32,0.15)' },
  { id: 'popular', coins: '6,000', icon: '$$', color: '#ffc220', bg: 'rgba(255,194,32,0.15)' },
  { id: 'big', coins: '15,000', icon: '$$$', color: '#ffc220', bg: 'rgba(255,194,32,0.15)' },
  { id: 'whale', coins: '40,000', icon: '$$$$', color: '#ffc220', bg: 'rgba(255,194,32,0.15)' },
  { id: 'premium-pass', coins: 'PREMIUM', icon: '\u2605', color: '#ffc220', bg: 'rgba(255,194,32,0.15)', label: 'PASS' },
  { id: 'plus-pass', coins: 'PLUS', icon: '\u2605\u2605', color: '#c8a8ff', bg: 'rgba(200,168,255,0.15)', label: 'PASS' },
];

function makeHTML(product) {
  return `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Lilita+One&family=Fredoka:wght@600;700&display=swap" rel="stylesheet">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: transparent; }
.icon {
  width: 512px;
  height: 512px;
  background: linear-gradient(160deg, #0d2350 0%, #0a1a3a 60%, #091533 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 80px;
  position: relative;
  overflow: hidden;
}
.glow {
  position: absolute;
  width: 300px;
  height: 300px;
  border-radius: 50%;
  background: ${product.bg};
  filter: blur(60px);
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}
.coin-symbol {
  font-family: 'Lilita One', cursive;
  font-size: ${product.icon.length > 2 ? '80' : '120'}px;
  color: ${product.color};
  z-index: 2;
  text-shadow: 0 4px 20px rgba(255,194,32,0.3);
}
.coins-text {
  font-family: 'Fredoka', sans-serif;
  font-weight: 700;
  font-size: 64px;
  color: white;
  z-index: 2;
  margin-top: 10px;
}
.label {
  font-family: 'Fredoka', sans-serif;
  font-weight: 600;
  font-size: 28px;
  color: rgba(255,255,255,0.5);
  z-index: 2;
  margin-top: 4px;
  letter-spacing: 2px;
  text-transform: uppercase;
}
</style>
</head><body>
<div class="icon">
  <div class="glow"></div>
  <div class="coin-symbol">${product.icon}</div>
  <div class="coins-text">${product.coins}</div>
  <div class="label">${product.label || 'COINS'}</div>
</div>
</body></html>`;
}

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 612, height: 612, deviceScaleFactor: 1 });

  const outDir = path.resolve(__dirname, '..', 'assets', 'iap-icons');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  for (const product of PRODUCTS) {
    const html = makeHTML(product);
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await new Promise(r => setTimeout(r, 3000));

    const el = await page.$('.icon');
    const outPath = path.join(outDir, `${product.id}.png`);
    await el.screenshot({ path: outPath });
    console.log(`${product.id}.png (512x512)`);
  }

  console.log(`\nDone! ${PRODUCTS.length} icons → assets/iap-icons/`);
  await browser.close();
})();
