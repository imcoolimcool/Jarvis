import puppeteer from 'puppeteer';

const VITE_URL = 'http://localhost:5173';

async function takeScreenshots() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    // Desktop screenshot
    const desktopPage = await browser.newPage();
    await desktopPage.setViewport({ width: 1440, height: 900 });
    await desktopPage.goto(VITE_URL, { waitUntil: 'networkidle0', timeout: 30000 });
    await desktopPage.waitForSelector('body', { timeout: 10000 });
    await desktopPage.screenshot({
      path: '/home/kasperkal1970/jarvis/screenshots/desktop-ui-check.png',
      fullPage: true,
    });
    console.log('✅ Desktop screenshot saved');
    await desktopPage.close();

    // Mobile screenshot
    const mobilePage = await browser.newPage();
    await mobilePage.setViewport({ width: 375, height: 812 });
    await mobilePage.goto(VITE_URL, { waitUntil: 'networkidle0', timeout: 30000 });
    await mobilePage.waitForSelector('body', { timeout: 10000 });
    await mobilePage.screenshot({
      path: '/home/kasperkal1970/jarvis/screenshots/mobile-ui-check.png',
      fullPage: true,
    });
    console.log('✅ Mobile screenshot saved');
    await mobilePage.close();

    // Also grab the console output for JS errors
    const checkPage = await browser.newPage();
    const consoleLogs = [];
    checkPage.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
      }
    });
    await checkPage.setViewport({ width: 1440, height: 900 });
    await checkPage.goto(VITE_URL, { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));
    if (consoleLogs.length > 0) {
      console.log('⚠️ Console errors found:');
      consoleLogs.forEach(l => console.log('  ' + l));
    } else {
      console.log('✅ No console errors');
    }
    await checkPage.close();

  } catch (err) {
    console.error('❌ Puppeteer error:', err.message);
  } finally {
    await browser.close();
  }
}

takeScreenshots().catch(console.error);
