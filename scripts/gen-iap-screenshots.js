const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  const filePath = path.resolve(__dirname, '..', 'iap-screenshots.html');
  await page.goto(`file://${filePath}`, { waitUntil: 'networkidle0' });

  // Wait for fonts to load
  await page.evaluate(() => document.fonts.ready);
  await new Promise(r => setTimeout(r, 2000));

  const cards = await page.$$('.iap-card');
  const names = [
    'iap-starter-pack',
    'iap-popular-pack',
    'iap-big-spender',
    'iap-whale-pack',
    'iap-season-pass-premium',
    'iap-season-pass-plus'
  ];

  const outDir = path.resolve(__dirname, '..', 'assets', 'iap-screenshots');
  const fs = require('fs');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  for (let i = 0; i < cards.length; i++) {
    const outPath = path.join(outDir, `${names[i]}.png`);
    await cards[i].screenshot({ path: outPath });
    console.log(`Saved: ${outPath}`);
  }

  console.log(`\nDone! ${cards.length} screenshots saved to assets/iap-screenshots/`);
  await browser.close();
})();
