import puppeteer from 'puppeteer';
const BASE = 'http://localhost:5173';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 });
await wait(2000);

// Screenshot home
await page.screenshot({ path: '/tmp/ui-home.png' });
console.log('✓ Home captured');

// Analyze full layout structure
const analysis = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll('*'));
  const visible = all.filter(el => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 5 && r.height > 5 && s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
  });
  
  // Find main layout regions
  const layoutRegions = visible.filter(el => {
    const r = el.getBoundingClientRect();
    return r.width > 150 && r.height > 150;
  }).map(el => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return {
      tag: el.tagName,
      cls: (el.className||'').toString().split(' ').slice(0,4).join(' '),
      w: Math.round(r.width),
      h: Math.round(r.height),
      x: Math.round(r.x),
      y: Math.round(r.y),
      bg: s.backgroundColor,
      border: s.borderRadius,
      display: s.display,
      pos: s.position
    };
  }).filter(e => e.w > 100 && e.h > 100).slice(0, 20);
  
  // Find navigation/sidebar
  const sidebar = visible.filter(el => {
    const r = el.getBoundingClientRect();
    return r.x < 50 && r.width > 50 && r.width < 400 && r.height > 300;
  }).map(el => ({
    tag: el.tagName,
    cls: (el.className||'').toString().split(' ').slice(0,3).join(' '),
    w: Math.round(el.getBoundingClientRect().width),
    h: Math.round(el.getBoundingClientRect().height),
    bg: getComputedStyle(el).backgroundColor
  })).slice(0, 5);
  
  // Find buttons/inputs
  const inputs = visible.filter(el => ['INPUT','TEXTAREA','BUTTON'].includes(el.tagName)).map(el => ({
    tag: el.tagName,
    text: (el.textContent||el.placeholder||'').trim().slice(0,40),
    cls: (el.className||'').toString().split(' ').slice(0,3).join(' '),
    w: Math.round(el.getBoundingClientRect().width),
    h: Math.round(el.getBoundingClientRect().height)
  })).slice(0, 15);
  
  // Find headings
  const headings = visible.filter(el => ['H1','H2','H3'].includes(el.tagName)).map(el => ({
    tag: el.tagName,
    text: (el.textContent||'').trim().slice(0,60),
    fontSize: getComputedStyle(el).fontSize,
    color: getComputedStyle(el).color
  })).slice(0, 10);
  
  return { layoutRegions, sidebar, inputs, headings };
});
console.log('Layout analysis:', JSON.stringify(analysis, null, 2));
await browser.close();
