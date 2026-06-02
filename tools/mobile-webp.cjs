const { pathToFileURL } = require('url');
const fs = require('fs');
const path = require('path');
(async () => {
  const puppeteer = (await import(pathToFileURL(require.resolve('puppeteer-core')).href)).default;
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('about:blank');
  const ROOT = '/Users/beekeeper/Documents/Slot1';
  const jobs = [
    { in: 'assets/mobile/Background_static.jpeg',    out: 'assets/mobile/background.webp',    mime: 'image/jpeg', w: 1366, h: null, q: 0.82 },
    { in: 'assets/mobile/Wanted_poster_static.jpeg', out: 'assets/mobile/wanted_poster.webp', mime: 'image/jpeg', w: 1200, h: null, q: 0.82 },
    { in: 'assets/mobile/Spin_static.png',           out: 'assets/mobile/spin.webp',          mime: 'image/png',  w: 384,  h: 384,  q: 0.9  },
  ];
  for (const j of jobs) {
    const srcDataUrl = `data:${j.mime};base64,` + fs.readFileSync(path.join(ROOT, j.in)).toString('base64');
    const outDataUrl = await page.evaluate(async (srcDataUrl, w, h, q) => {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('load fail')); img.src = srcDataUrl; });
      const tw = w || img.naturalWidth;
      const th = h || Math.round(img.naturalHeight * (tw / img.naturalWidth));
      const c = document.createElement('canvas'); c.width = tw; c.height = th;
      c.getContext('2d').drawImage(img, 0, 0, tw, th);
      return c.toDataURL('image/webp', q);
    }, srcDataUrl, j.w, j.h, j.q);
    if (!outDataUrl.startsWith('data:image/webp')) throw new Error('not webp: ' + j.in);
    fs.writeFileSync(path.join(ROOT, j.out), Buffer.from(outDataUrl.split(',')[1], 'base64'));
    console.log(`  ${j.out}  ${(fs.statSync(path.join(ROOT, j.out)).size/1024).toFixed(0)} KB`);
  }
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
