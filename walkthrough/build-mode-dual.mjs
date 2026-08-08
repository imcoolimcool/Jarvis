import puppeteer from 'puppeteer';
const BASE = 'http://localhost:5173';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--no-setuid-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

// Collect console errors so we know if React is unhappy
page.on('console', (msg) => { if (msg.type() === 'error') console.log('  [console.error]', msg.text().slice(0, 200)); });

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 });
await wait(2000);

// Trigger Build Mode
await page.click('.chat-composer-input');
await page.keyboard.type('@Build a simple portfolio', { delay: 10 });
await page.keyboard.press('Enter');
await wait(6000);

// Aggressive modal dismissal:
//  - "Change plan" closes the Plan Mode modal (z-[75]) AND the wizard (z-[70]),
//    WITHOUT triggering a build. Perfect for a stable clean screenshot.
//  - Otherwise click the wizard backdrop overlay (z-[70]) directly.
async function dismissModals() {
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const changePlan = btns.find((b) => /change plan/i.test(b.innerText));
    if (changePlan) { changePlan.click(); return 'change-plan'; }
    const overlay = Array.from(document.querySelectorAll('div')).find((el) =>
      el.className && el.className.toString().includes('z-[70]')
    );
    if (overlay) { overlay.click(); return 'wizard-backdrop'; }
    return 'nothing';
  });
}
let r1 = await dismissModals();
await wait(1500);
let r2 = await dismissModals();
await wait(1200);
console.log('Dismissed:', r1, '/', r2);

// Force dark mode via custom event (useTheme listens for it)
await page.evaluate(() => {
  try { localStorage.setItem('jarvis-theme', 'dark'); } catch {}
  document.documentElement.classList.remove('light');
  document.documentElement.classList.add('dark');
  window.dispatchEvent(new CustomEvent('jarvis-theme-change', { detail: 'dark' }));
});
await wait(1200);
await dismissModals();
await wait(1200);

await page.screenshot({ path: '/tmp/build-dark.png' });
console.log('✓ Build Mode captured (dark mode)');

// Force light mode via custom event
await page.evaluate(() => {
  try { localStorage.setItem('jarvis-theme', 'light'); } catch {}
  document.documentElement.classList.remove('dark');
  document.documentElement.classList.add('light');
  window.dispatchEvent(new CustomEvent('jarvis-theme-change', { detail: 'light' }));
});
await wait(1200);
await dismissModals();
await wait(1200);

await page.screenshot({ path: '/tmp/build-light.png' });
console.log('✓ Build Mode captured (light mode)');

// Report what's on screen + key background colors
const report = await page.evaluate(() => {
  const visibleModals = Array.from(document.querySelectorAll('[class*="z-[7"], [class*="z-[6]"]'))
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 100 && r.height > 100 && getComputedStyle(el).position === 'fixed';
    })
    .map((el) => ({ cls: el.className.toString().slice(0, 40), w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) }));
  const studio = document.querySelector('[class*="rounded-t-3xl"]');
  const studioBg = studio ? getComputedStyle(studio).backgroundColor : 'no studio';
  const rootCls = document.documentElement.className;
  return { visibleModals, studioBg, rootCls };
});
console.log('Screen state (light):', JSON.stringify(report, null, 2));

await browser.close();
console.log('Done — check /tmp/build-dark.png and /tmp/build-light.png');
