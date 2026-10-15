import { chromium } from 'playwright';
const D = new URL('.', import.meta.url).pathname;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [f, s] of [['icon', 1024], ['splash', 2732]]) {
  const p = await b.newPage({ viewport: { width: s, height: s } });
  await p.goto(`file://${D}/${f}.html`); await p.waitForTimeout(300);
  await p.screenshot({ path: `${D}/${f}-rgba.png` });
}
await b.close();
