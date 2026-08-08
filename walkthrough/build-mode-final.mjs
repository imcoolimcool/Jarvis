import puppeteer from 'puppeteer';
const BASE = 'http://localhost:5173';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 });
await wait(2000);

// Trigger Build Mode
await page.click('.chat-composer-input');
await page.keyboard.type('@Build a simple portfolio', { delay: 10 });
await page.keyboard.press('Enter');
await wait(8000);

// Dismiss wizard
await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button'));
  const skip = btns.find((b) => /skip all/i.test(b.innerText));
  if (skip) skip.click();
});
await wait(2000);

// Screenshot Build Mode without wizard
await page.screenshot({ path: '/tmp/build-replit.png' });
console.log('✓ Build Mode captured');

// Detailed layout analysis
const layout = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll('*'));
  const visible = all.filter(el => {
    const r = el.getBoundingClientRect();
    return r.width > 10 && r.height > 10;
  });
  
  // Find sidebar
  const sidebar = visible.filter(el => {
    const r = el.getBoundingClientRect();
    return r.x < 50 && r.width > 100 && r.width < 350 && r.height > 400;
  }).map(el => ({
    tag: el.tagName,
    cls: (el.className||'').toString().split(' ').slice(0,4).join(' '),
    w: Math.round(el.getBoundingClientRect().width),
    h: Math.round(el.getBoundingClientRect().height),
    bg: getComputedStyle(el).backgroundColor,
    borderRight: getComputedStyle(el).borderRight
  })).slice(0, 3);
  
  // Find editor/main content
  const editor = visible.filter(el => {
    const r = el.getBoundingClientRect();
    return r.x > 200 && r.width > 600 && r.height > 400;
  }).map(el => ({
    tag: el.tagName,
    cls: (el.className||'').toString().split(' ').slice(0,4).join(' '),
    w: Math.round(el.getBoundingClientRect().width),
    h: Math.round(el.getBoundingClientRect().height),
    x: Math.round(el.getBoundingClientRect().x),
    bg: getComputedStyle(el).backgroundColor
  })).slice(0, 5);
  
  // Find tab bar
  const tabs = visible.filter(el => {
    const r = el.getBoundingClientRect();
    return r.height < 60 && r.height > 20 && r.y > 50 && r.y < 120;
  }).map(el => ({
    tag: el.tagName,
    text: (el.textContent||'').trim().slice(0,40),
    cls: (el.className||'').toString().split(' ').slice(0,3).join(' '),
    w: Math.round(el.getBoundingClientRect().width),
    h: Math.round(el.getBoundingClientRect().height),
    y: Math.round(el.getBoundingClientRect().y)
  })).slice(0, 10);
  
  // Find header bar
  const header = visible.filter(el => {
    const r = el.getBoundingClientRect();
    return r.y < 20 && r.height < 70 && r.height > 20;
  }).map(el => ({
    tag: el.tagName,
    text: (el.textContent||'').trim().slice(0,50),
    cls: (el.className||'').toString().split(' ').slice(0,3).join(' '),
    w: Math.round(el.getBoundingClientRect().width),
    h: Math.round(el.getBoundingClientRect().height),
    bg: getComputedStyle(el).backgroundColor
  })).slice(0, 5);
  
  return { sidebar, editor, tabs, header };
});
console.log('Build Mode layout:', JSON.stringify(layout, null, 2));
await browser.close();
