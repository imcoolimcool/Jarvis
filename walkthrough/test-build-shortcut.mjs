// Test the "@Build <message>" chat shortcut: typing it in the composer should
// auto-open Build Studio with the task prefilled and trigger a scaffold run.
// Usage: BASE_URL=http://localhost:5173 node walkthrough/test-build-shortcut.mjs
import puppeteer from 'puppeteer';
import { mkdirSync } from 'fs';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const SHOTS = 'walkthrough-screenshots';
mkdirSync(SHOTS, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  headless: process.env.HEADFUL !== '1',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

try {
  // 1. Load the app
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.chat-composer-input', { timeout: 20000 });
  check('app loaded, composer present', true);

  // 2. Type "@build Make a 3D game" and press Enter
  await page.click('.chat-composer-input');
  await page.keyboard.type('@build Make a 3D game', { delay: 25 });
  const composerValue = await page.$eval('.chat-composer-input', (el) => el.value);
  check('composer contains @build text', composerValue.includes('@build Make a 3D game'), composerValue);

  await page.keyboard.press('Enter');
  await wait(1800);

  // 3. Build Studio should open with the task prefilled
  // The wizard panel uses "Build Mode" heading or a "PROMPT PLAN" label.
  const buildVisible = await page.evaluate(() => {
    const text = document.body.innerText;
    const hasBuildMode = text.includes('Build Mode');
    const hasPromptPlan = text.includes('PROMPT PLAN') || text.includes('PROMPT');
    const hasWizard = text.includes('AI starter questions');
    return hasBuildMode || hasPromptPlan || hasWizard;
  });

  // Find the scaffold prompt input and its value
  const scaffoldPrompt = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('textarea, input'));
    const match = inputs.find((i) => {
      const v = (i.value || '').trim();
      const ph = (i.placeholder || '');
      return v.toLowerCase().includes('3d game') || /build|scaffold|describe|what are we/i.test(ph);
    });
    return match ? match.value : null;
  });
  check('Build Studio opened with task prefilled', buildVisible && !!scaffoldPrompt, scaffoldPrompt || '(no prompt field found)');

  await page.screenshot({ path: `${SHOTS}/build-shortcut-opened.png` });

  // 4. Press the scaffold/build submit and confirm a run starts
  const buildStarted = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const b = btns.find((x) => /build|scaffold|generate|start/i.test(x.innerText || '') && x.offsetParent);
    if (b) { b.click(); return b.innerText.trim(); }
    return null;
  });
  check('build run triggered', !!buildStarted, buildStarted || '(no build button found)');

  await wait(4000);
  await page.screenshot({ path: `${SHOTS}/build-shortcut-running.png` });
  const runningState = await bodyText(page);
  check('build studio running (has busy/status text)', /building|scaffold|plan|wizard|writing|generating/i.test(runningState));

  // Also confirm chat did NOT treat it as a normal message
  const chatHasBuildMsg = await page.evaluate(() =>
    document.body.innerText.includes('Make a 3D game') && document.body.innerText.includes('jarvis'),
  );
  check('@build not sent as normal chat message', !chatHasBuildMsg);
} catch (err) {
  check('test ran without uncaught error', false, err.message);
  await page.screenshot({ path: `${SHOTS}/build-shortcut-error.png` }).catch(() => {});
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);

async function bodyText(page) {
  try { return await page.evaluate(() => document.body.innerText.slice(0, 900)); } catch { return ''; }
}
