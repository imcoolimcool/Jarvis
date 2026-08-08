import puppeteer from 'puppeteer';
const BASE = 'http://localhost:5173';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

// Go to home
await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 });
await wait(2000);

// Trigger Build Mode via @Build command
await page.click('.chat-composer-input');
await page.keyboard.type('@Build a simple portfolio', { delay: 10 });
await page.keyboard.press('Enter');
await wait(8000); // Wait for build to load

// Screenshot Build Mode
await page.screenshot({ path: '/tmp/build-mode-ui.png' });
console.log('✓ Build Mode captured');

// Analyze Build Mode layout
const buildLayout = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll('*'));
  const visible = all.filter(el => {
    const r = el.getBoundingClientRect();
    return r.width > 10 && r.height > 10;
  });
  
  // Find panels: sidebar, editor, terminal, preview
  const panels = visible.filter(el => {
    const r = el.getBoundingClientRect();
    return r.width > 100 && r.height > 100;
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
      border: s.borderRight || s.borderLeft || 'none'
    };
  }).filter(e => e.w > 50 && e.h > 50).slice(0, 20);
  
  // Check for file explorer
  const hasExplorer = visible.some(el => 
    (el.textContent||'').toLowerCase().includes('explorer') && el.getBoundingClientRect().width < 300
  );
  
  // Check for terminal
  const hasTerminal = visible.some(el =>
    (el.textContent||'').toLowerCase().includes('terminal')
  );
  
  return { panels, hasExplorer, hasTerminal };
});
console.log('Build Mode layout:', JSON.stringify(buildLayout, null, 2));
await browser.close();
