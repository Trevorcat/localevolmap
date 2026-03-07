import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(BASE_URL);
  await page.waitForTimeout(2000);

  const data = await page.evaluate(() => {
    const values = Array.from(document.querySelectorAll('.stat-value'));
    return values.map(el => ({
      text: el.textContent,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      fontSize: window.getComputedStyle(el).fontSize,
      lineHeight: window.getComputedStyle(el).lineHeight,
      height: window.getComputedStyle(el).height
    }));
  });

  console.log('--- TRUNCATE_DATA ---');
  console.log(JSON.stringify(data, null, 2));
  await browser.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});