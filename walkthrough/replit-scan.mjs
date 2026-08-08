import puppeteer from 'puppeteer';
const BASE = 'https://psychic-happiness-pjj797x96xqp37x6w-5173.app.github.dev';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

// Screenshot1: Home page
await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 45000 });
await wait(2000);
await page.screenshot({ path: '/tmp/replit-home.png' });
console.log('✓ Home page captured');

// Analyze layout structure
const layout = await page.evaluate(() => {
  const body = document.body;
  const all = Array.from(document.querySelectorAll('*'));
  const visible = all.filter(el => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
  });
  // Get top-level structure
  const topLevel = visible.filter(el => {
    const r = el.getBoundingClientRect();
    return r.top < 100 && r.width > 50;
  }).map(el => ({
    tag: el.tagName,
    text: (el.textContent||'').trim().slice(0,50),
    cls: (el.className||'').toString().slice(0,60),
    w: Math.round(el.getBoundingClientRect().width),
    h: Math.round(el.getBoundingClientRect().height),
    x: Math.round(el.getBoundingClientRect().x)
  }));
  
  // Get sidebar/panel structure  
  const panels = visible.filter(el => {
    const r = el.getBoundingClientRect();
    return r.width > 100 && r.height > 200 && (r.x < 300 || r.x > 1100);
  }).map(el => ({
    tag: el.tagName,
    text: (el.textContent||'').trim().slice(0,40),
    cls: (el.className||'').toString().slice(0,60),
    w: Math.round(el.getBoundingClientRect().width),
    h: Math.round(el.getBoundingClientRect().height),
    x: Math.round(el.getBoundingClientRect().x)
  }));
  
  return { topLevel: topLevel.slice(0,15), panels: panels.slice(0,10) };
});
console.log('Layout:', JSON.stringify(layout, null, 2));
await browser.close();
