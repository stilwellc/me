// Browser smoke test: every page at desktop and phone, no page errors, no failed
// same-origin requests, and headers stop drawing once scrolled away after a resize.
// usage: node _tools/smoke.js http://localhost:8080/
const { chromium, devices } = require('playwright');
const base = process.argv[2] || 'http://localhost:8080/';
const fs = require('fs');
const pages = [''].concat(fs.readdirSync('.').filter(f => f.endsWith('.html') && !['work.html', 'vault.html'].includes(f)));
(async () => {
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const bad = [];
  for (const [tag, opts] of [['desk', { viewport: { width: 1440, height: 900 } }], ['phone', devices['iPhone 13']]]) {
    const ctx = await b.newContext(opts);
    for (const p of pages) {
      const pg = await ctx.newPage();
      pg.on('pageerror', e => bad.push(`${tag} ${p || 'index'}: ${e.message}`));
      pg.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base) && !/404\.html$|nope/.test(r.url())) bad.push(`${tag} ${p || 'index'}: ${r.status()} ${r.url()}`); });
      await pg.goto(base + p, { waitUntil: 'load' });
      await pg.waitForTimeout(1500);
      if (tag === 'desk' && p !== '404.html') {
        const fps = await pg.evaluate(async () => {
          window.scrollTo(0, document.body.scrollHeight); window.dispatchEvent(new Event('resize'));
          await new Promise(r => setTimeout(r, 3000));
          let n = 0; const t = performance.now(); const orig = window.requestAnimationFrame;
          window.requestAnimationFrame = f => orig(x => { n++; f(x); });
          await new Promise(r => setTimeout(r, 1000)); window.requestAnimationFrame = orig;
          return document.body.scrollHeight > innerHeight * 1.6 ? n : 0;
        });
        if (fps > 5) bad.push(`${tag} ${p}: ${fps} frames/s drawn while scrolled away`);
      }
      await pg.close();
    }
    await ctx.close();
  }
  await b.close();
  console.log(bad.join('\n') || 'smoke: ok');
  process.exit(bad.length ? 1 : 0);
})();
