import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('http://10.104.11.12:3000');
  await page.waitForTimeout(2000); // Wait for render
  
  const data = await page.evaluate(() => {
    const values = Array.from(document.querySelectorAll('.stat-value'));
    return values.map(el => {
      return {
        text: el.textContent,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        fontSize: window.getComputedStyle(el).fontSize,
        lineHeight: window.getComputedStyle(el).lineHeight,
        height: window.getComputedStyle(el).height
      };
    });
  });
  console.log('--- TRUNCATE_DATA ---');
  console.log(JSON.stringify(data, null, 2));

  await browser.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
