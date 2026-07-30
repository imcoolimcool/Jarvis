import puppeteer from 'puppeteer';
import { mkdirSync, existsSync } from 'fs';

const SCREENSHOTS_DIR = '/home/kasperkal1970/jarvis/screenshots';

async function main() {
  if (!existsSync(SCREENSHOTS_DIR)) mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  // === DESKTOP ===
  const dp = await browser.newPage();
  await dp.setViewport({ width: 1440, height: 900 });

  console.log('1. Dark mode voice (desktop)');
  await dp.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(4000);
  await dp.screenshot({ path: `${SCREENSHOTS_DIR}/01-dark-voice-desktop.png` });
  console.log('   ✓ saved');

  console.log('2. Switch to chat mode');
  await dp.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    btns.find(b => b.textContent?.includes('Chat'))?.click();
  });
  await wait(1500);
  await dp.screenshot({ path: `${SCREENSHOTS_DIR}/02-dark-chat-desktop.png` });
  console.log('   ✓ saved');

  console.log('3. Toggle to light mode');
  await dp.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    btns.find(b => b.title?.includes('Light') || b.title?.includes('Dark'))?.click();
  });
  await wait(1000);
  await dp.screenshot({ path: `${SCREENSHOTS_DIR}/03-light-chat-desktop.png` });
  console.log('   ✓ saved');

  console.log('4. Open settings');
  await dp.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    btns.find(b => b.title === 'Settings')?.click();
  });
  await wait(1000);
  await dp.screenshot({ path: `${SCREENSHOTS_DIR}/04-settings-desktop.png` });
  console.log('   ✓ saved');

  // Close settings by clicking backdrop
  await dp.evaluate(() => {
    document.querySelectorAll('[class*="fixed inset-0"]').forEach(el => {
      if (el.style.zIndex === '' && el.className.includes('z-40')) el.click();
    });
  });
  await wait(500);

  // === MOBILE ===
  const mp = await browser.newPage();
  await mp.setViewport({ width: 390, height: 844 });

  console.log('5. Mobile dark voice');
  await mp.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(4000);
  await mp.screenshot({ path: `${SCREENSHOTS_DIR}/05-mobile-voice.png` });
  console.log('   ✓ saved');

  console.log('6. Mobile chat');
  await mp.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    btns.find(b => b.textContent?.includes('Chat'))?.click();
  });
  await wait(1500);
  await mp.screenshot({ path: `${SCREENSHOTS_DIR}/06-mobile-chat.png` });
  console.log('   ✓ saved');

  console.log('7. Mobile sidebar');
  await mp.evaluate(() => {
    const btn = document.querySelector('[aria-label="Open history"]');
    if (btn) btn.click();
  });
  await wait(1000);
  await mp.screenshot({ path: `${SCREENSHOTS_DIR}/07-mobile-sidebar.png` });
  console.log('   ✓ saved');

  // === TABLET ===
  const tp = await browser.newPage();
  await tp.setViewport({ width: 1024, height: 768 });

  console.log('8. iPad view');
  await tp.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(4000);
  await tp.screenshot({ path: `${SCREENSHOTS_DIR}/08-ipad-voice.png` });
  console.log('   ✓ saved');

  console.log('9. Wide monitor (1920)');
  const wp = await browser.newPage();
  await wp.setViewport({ width: 1920, height: 1080 });
  await wp.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wp.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    btns.find(b => b.textContent?.includes('Chat'))?.click();
  });
  await wait(3000);
  await wp.screenshot({ path: `${SCREENSHOTS_DIR}/09-wide-chat.png` });
  console.log('   ✓ saved');

  await browser.close();
  console.log('\n✅ All 9 screenshots captured!');
}

main().catch(e => { console.error('ERROR:', e); process.exit(1); });
