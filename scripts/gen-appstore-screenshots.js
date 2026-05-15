const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const SIZES = [
  { name: 'iphone-69', width: 1320, height: 2868, label: 'iPhone 6.9"', phoneScale: 2.15, headlineSize: 86, topPad: 150 },
  { name: 'iphone-65', width: 1284, height: 2778, label: 'iPhone 6.5"', phoneScale: 2.08, headlineSize: 84, topPad: 140 },
  { name: 'ipad',      width: 2048, height: 2732, label: 'iPad 12.9"',  phoneScale: 2.05, headlineSize: 92, topPad: 120 },
  { name: 'google-play', width: 1440, height: 2560, label: 'Google Play (9:16)', phoneScale: 2.10, headlineSize: 86, topPad: 140 },
];

const SLIDE_NAMES = [
  '01-lobby',
  '02-betting',
  '03-race',
  '04-season',
  '05-store',
  '06-roster'
];

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  const filePath = path.resolve(__dirname, '..', 'appstore-screenshots.html');

  for (const size of SIZES) {
    console.log(`\n=== Generating ${size.label} (${size.width}x${size.height}) ===`);

    // Set viewport large enough for this size
    await page.setViewport({
      width: size.width + 100,
      height: size.height + 100,
      deviceScaleFactor: 1
    });

    await page.goto(`file://${filePath}`, { waitUntil: 'networkidle0' });

    // Wait for Google Fonts
    await page.evaluate(() => document.fonts.ready);
    await new Promise(r => setTimeout(r, 3000));

    // Reset zoom to 100% and resize slides for this target size
    await page.evaluate((w, h, ps, hs, tp) => {
      document.querySelectorAll('.screenshot-slide').forEach(s => {
        s.style.transform = 'scale(1)';
        s.style.transformOrigin = 'top center';
        s.style.width = w + 'px';
        s.style.height = h + 'px';
      });

      // Adjust phone frame scale
      document.querySelectorAll('.phone-frame').forEach(f => {
        f.style.transform = `scale(${ps})`;
      });

      // Adjust headline sizes for wider/narrower slides
      document.querySelectorAll('.headline').forEach(el => {
        // Scale headline proportionally
        const currentSize = parseInt(el.style.fontSize) || 86;
        const ratio = hs / 86;
        el.style.fontSize = Math.round(currentSize * ratio) + 'px';
      });

      // Adjust top padding
      document.querySelectorAll('.screenshot-slide > div:last-child > div:first-child').forEach(el => {
        // These are the inner content wrappers with padding-top
        if (el.style.paddingTop) {
          el.style.paddingTop = tp + 'px';
        }
      });
    }, size.width, size.height, size.phoneScale, size.headlineSize, size.topPad);

    await new Promise(r => setTimeout(r, 500));

    const screenshots = await page.$$('.screenshot-slide');

    const outDir = path.resolve(__dirname, '..', 'assets', 'appstore-screenshots', size.name);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    for (let i = 0; i < screenshots.length; i++) {
      const outPath = path.join(outDir, `${SLIDE_NAMES[i]}.png`);
      await screenshots[i].screenshot({ path: outPath });

      const box = await screenshots[i].boundingBox();
      console.log(`  ${SLIDE_NAMES[i]}.png (${box.width}x${box.height})`);
    }

    console.log(`  Done! ${screenshots.length} screenshots → assets/appstore-screenshots/${size.name}/`);
  }

  // Generate Google Play feature graphic (1024x500)
  console.log('\n=== Generating Google Play Feature Graphic (1024x500) ===');
  await page.setViewport({ width: 1124, height: 600, deviceScaleFactor: 1 });
  const featurePath = path.resolve(__dirname, '..', 'google-play-feature-graphic.html');
  await page.goto(`file://${featurePath}`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  await new Promise(r => setTimeout(r, 3000));

  const featureEl = await page.$('.feature-graphic');
  const featureOutDir = path.resolve(__dirname, '..', 'assets', 'appstore-screenshots', 'google-play');
  if (!fs.existsSync(featureOutDir)) fs.mkdirSync(featureOutDir, { recursive: true });
  await featureEl.screenshot({ path: path.join(featureOutDir, 'feature-graphic.png') });
  console.log('  feature-graphic.png (1024x500)');

  console.log('\n=== All sizes generated! ===');
  await browser.close();
})();
