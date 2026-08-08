const puppeteer = require('puppeteer');

async function testBuildMode() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  console.log('Navigating to Jarvis...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0', timeout: 30000 });

  // Take initial screenshot
  await page.screenshot({ path: '/workspaces/Jarvis/screenshots/01-initial.png', fullPage: true });
  console.log('Initial screenshot saved');

  // Wait for page to load
  await new Promise(r => setTimeout(r, 2000));

  // Get all buttons and their text
  const buttons = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    return btns.map(b => ({ text: b.innerText.trim(), class: b.className, aria: b.getAttribute('aria-label') }));
  });

  console.log('Buttons found:', buttons.filter(b => b.text).slice(0, 30));

  // Look for build-related elements using evaluate
  const buildElements = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('*'));
    return all
      .filter(el => {
        const text = (el.innerText || '').toLowerCase();
        const aria = (el.getAttribute('aria-label') || '').toLowerCase();
        const className = String(el.className || '').toLowerCase();
        return text.includes('build') || aria.includes('build') || className.includes('build');
      })
      .map(el => ({ tag: el.tagName, text: (el.innerText || '').trim().slice(0, 100), class: String(el.className || ''), aria: el.getAttribute('aria-label') }))
      .slice(0, 20);
  });

  console.log('Build-related elements:', buildElements);

  // Try to find plus menu or similar
  let plusButton = await page.$('button[aria-label*="plus" i], button[title*="plus" i]');
  if (!plusButton) {
    // Try SVG with plus icon
    const plusSvg = await page.$('svg.lucide-plus, svg[data-lucide="plus"]');
    if (plusSvg) {
      plusButton = await plusSvg.evaluateHandle(el => el.closest('button'));
    }
  }

  if (plusButton) {
    console.log('Found plus button, clicking...');
    await plusButton.click();
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: '/workspaces/Jarvis/screenshots/02-plus-menu.png', fullPage: true });

    // Close plus menu and use @build shortcut in chat input instead
    await page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 500));
  }

  // Use @build shortcut in the chat input
  console.log('Using @build shortcut in chat input...');
  const chatInput = await page.$('.chat-composer-input, textarea[placeholder*="placeholder"]');
  if (chatInput) {
    await chatInput.click();
    await new Promise(r => setTimeout(r, 500));
    await chatInput.type('@build Create a beautiful bakery landing page with hero section, menu, and contact form');
    await new Promise(r => setTimeout(r, 500));
    await chatInput.press('Enter');
    await new Promise(r => setTimeout(r, 3000));
    await page.screenshot({ path: '/workspaces/Jarvis/screenshots/03-after-at-build.png', fullPage: true });
  } else {
    console.log('Chat input not found, trying keyboard shortcut Ctrl+B');
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyB');
    await page.keyboard.up('Control');
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: '/workspaces/Jarvis/screenshots/03-after-ctrl-b.png', fullPage: true });
  }

  // Check if build studio modal opened
  const modal = await page.$('[role="dialog"], .fixed.inset-0, [data-build-studio]');
  if (modal) {
    console.log('Build Studio modal opened!');
    await testBuildStudio(page);
  } else {
    console.log('Build Studio did not open, checking UI state...');
    await page.screenshot({ path: '/workspaces/Jarvis/screenshots/04-no-modal.png', fullPage: true });

    // Try to find any dialog or modal
    const dialogs = await page.$$('.fixed.inset-0, [role="dialog"], .modal');
    console.log('Dialogs found:', dialogs.length);

    // Try to click the first build-related element using XPath
    const buildElements2 = await page.$x('//*[contains(translate(text(), "BUILD STUDIO", "build studio"), "build studio") or contains(translate(text(), "BUILD MODE", "build mode"), "build mode")]');
    console.log('Build text elements (XPath):', buildElements2.length);

    if (buildElements2.length > 0) {
      await buildElements2[0].click();
      await new Promise(r => setTimeout(r, 1000));
      await page.screenshot({ path: '/workspaces/Jarvis/screenshots/05-after-click-build.png', fullPage: true });

      // Check again for modal
      const modal2 = await page.$('[role="dialog"], .fixed.inset-0, [data-build-studio]');
      if (modal2) {
        console.log('Build Studio modal opened after click!');
        await testBuildStudio(page);
      }
    }
  }

  await browser.close();
}

async function testBuildStudio(page) {
  console.log('Testing Build Studio...');

  // Wait for studio to fully load
  await new Promise(r => setTimeout(r, 3000));

  // Take screenshot of the open modal
  await page.screenshot({ path: '/workspaces/Jarvis/screenshots/04-build-studio-open.png', fullPage: true });

  // First, check what's in the DOM - dump all buttons and inputs
  const allButtons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).map(btn => ({
      text: btn.innerText.trim(),
      class: btn.className,
      onClick: btn.onclick ? btn.onclick.toString().slice(0, 50) : ''
    }));
  });
  console.log('All buttons:', allButtons.filter(b => b.text).slice(0, 50));

  // Also check for elements inside the modal specifically
  const modalContent = await page.evaluate(() => {
    const modal = document.querySelector('[role="dialog"], .fixed.inset-0, .z-\\[60\\]');
    if (!modal) return 'No modal found';
    const buttons = Array.from(modal.querySelectorAll('button')).map(btn => ({
      text: btn.innerText.trim(),
      class: btn.className,
      onClick: btn.onclick ? btn.onclick.toString().slice(0, 50) : ''
    }));
    const inputs = Array.from(modal.querySelectorAll('input, textarea')).map(el => ({
      tag: el.tagName,
      placeholder: el.placeholder,
      class: el.className,
      value: el.value?.slice(0, 50)
    }));
    return { buttons: buttons.filter(b => b.text), inputs };
  });
  console.log('Modal content:', JSON.stringify(modalContent, null, 2));

  // Find scaffold input inside the modal - it's shown when no file is selected in editor tab
  // The placeholder is from t('studio.build.scaffoldPlaceholder') = "Build a landing page for a coffee shop"
  const scaffoldInput = await page.evaluateHandle(() => {
    const modal = document.querySelector('[role="dialog"], .fixed.inset-0, .z-\\[60\\]');
    if (!modal) return null;
    const inputs = Array.from(modal.querySelectorAll('input'));
    return inputs.find(el => el.placeholder && (
      el.placeholder.toLowerCase().includes('scaffold') ||
      el.placeholder.toLowerCase().includes('build') ||
      el.placeholder.toLowerCase().includes('app') ||
      el.placeholder.toLowerCase().includes('project') ||
      el.placeholder.toLowerCase().includes('describe') ||
      el.placeholder.toLowerCase().includes('create') ||
      el.placeholder.toLowerCase().includes('landing') ||
      el.placeholder.toLowerCase().includes('coffee')
    ));
  });

  if (scaffoldInput && (await scaffoldInput.evaluate(el => !!el))) {
    console.log('Found scaffold input via evaluate');
    const placeholder = await scaffoldInput.evaluate(el => el.placeholder);
    console.log('Placeholder:', placeholder);
    await scaffoldInput.type('Create a beautiful bakery landing page with a hero section, menu, and contact form');
    await new Promise(r => setTimeout(r, 500));
  } else {
    console.log('Scaffold input not found');
  }

  // Find scaffold button inside the modal - it has text "Scaffold" (from t('studio.build.scaffold'))
  const scaffoldButton = await page.evaluateHandle(() => {
    const modal = document.querySelector('[role="dialog"], .fixed.inset-0, .z-\\[60\\]');
    if (!modal) return null;
    const buttons = Array.from(modal.querySelectorAll('button'));
    return buttons.find(btn => {
      const text = btn.innerText.trim().toLowerCase();
      return text === 'scaffold' || text === 'build it';
    });
  });

  if (scaffoldButton && (await scaffoldButton.evaluate(el => !!el))) {
    console.log('Found scaffold button, clicking...');
    await scaffoldButton.click();

    // Wait for build to complete (give it time)
    console.log('Waiting for scaffold to complete...');
    await new Promise(r => setTimeout(r, 45000));
    await page.screenshot({ path: '/workspaces/Jarvis/screenshots/05-after-scaffold.png', fullPage: true });

    // Check for preview
    const previewIframe = await page.$('iframe[title="Build preview"]');
    if (previewIframe) {
      console.log('Preview iframe found!');
      const src = await previewIframe.getProperty('src');
      console.log('Preview URL:', await src.jsonValue());
    }
  } else {
    console.log('Scaffold button not found');
  }

  // Test tabs - they are buttons with onClick that call setTab(value)
  // Core tabs: editor, terminal, preview
  // More tabs: packages, env, git, search, quality, history, templates, docker, database, api
  console.log('\n--- Testing Tabs ---');

  // Find core tab buttons
  const coreTabButtons = await page.$$('button[style*="border-bottom"], button:has(Code2), button:has(Terminal), button:has(Play)');
  console.log('Core tab buttons found:', coreTabButtons.length);

  // Better: find all tab buttons by checking their onClick or text
  const allTabButtons = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    return buttons
      .filter(btn => {
        const text = btn.innerText.trim().toLowerCase();
        const onclick = btn.onclick ? btn.onclick.toString() : '';
        return ['editor', 'terminal', 'preview', 'packages', 'env', 'git', 'search', 'quality', 'history', 'templates', 'docker', 'database', 'api', 'more'].includes(text) ||
               onclick.includes('setTab');
      })
      .map(btn => ({
        text: btn.innerText.trim(),
        class: btn.className,
        onclick: btn.onclick ? btn.onclick.toString().slice(0, 100) : ''
      }));
  });
  console.log('Tab buttons found:', allTabButtons);

  // Try clicking each tab
  for (const tabName of ['editor', 'terminal', 'preview', 'packages', 'env', 'git', 'search', 'quality', 'history', 'templates', 'docker', 'database', 'api']) {
    const tabButton = await page.evaluateHandle((name) => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.find(btn => btn.innerText.trim().toLowerCase() === name);
    }, tabName);

    if (tabButton && (await tabButton.evaluate(el => !!el))) {
      console.log(`Clicking tab: ${tabName}`);
      await tabButton.click();
      await new Promise(r => setTimeout(r, 1000));
      await page.screenshot({ path: `/workspaces/Jarvis/screenshots/tab-${tabName}.png`, fullPage: true });
    } else {
      console.log(`Tab not found: ${tabName}`);
    }
  }

  // Check if "More" dropdown is needed for some tabs
  const moreButton = await page.evaluateHandle(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    return buttons.find(btn => btn.innerText.trim().toLowerCase() === 'more');
  });

  if (moreButton && (await moreButton.evaluate(el => !!el))) {
    console.log('Found More button, clicking...');
    await moreButton.click();
    await new Promise(r => setTimeout(r, 1000));

    // Now check for more tabs
    for (const tabName of ['packages', 'env', 'git', 'search', 'quality', 'history', 'templates', 'docker', 'database', 'api']) {
      const tabButton = await page.evaluateHandle((name) => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.find(btn => btn.innerText.trim().toLowerCase() === name);
      }, tabName);

      if (tabButton && (await tabButton.evaluate(el => !!el))) {
        console.log(`Clicking more tab: ${tabName}`);
        await tabButton.click();
        await new Promise(r => setTimeout(r, 1000));
        await page.screenshot({ path: `/workspaces/Jarvis/screenshots/tab-${tabName}.png`, fullPage: true });
      }
    }
  }
}

testBuildMode().catch(console.error);