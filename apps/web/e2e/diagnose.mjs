import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE_ERROR', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('CONSOLE', m.text());
});
await page.goto('http://localhost:8080');
await page.waitForTimeout(2000);
console.log((await page.locator('body').innerText()).slice(0, 2000));
await browser.close();
