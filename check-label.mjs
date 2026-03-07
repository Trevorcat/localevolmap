import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(BASE_URL);
  await page.waitForTimeout(2000);

  const data = await page.evaluate(() => {
    const card = document.querySelector('.stat-card');
    if (!card) return null;
    return {
      card: {
        scrollHeight: card.scrollHeight,
        clientHeight: card.clientHeight,
        boxSizing: window.getComputedStyle(card).boxSizing,
        height: window.getComputedStyle(card).height
      },
      children: Array.from(card.children).map(c => {
        const s = window.getComputedStyle(c);
        return {
          className: c.className,
          offsetHeight: c.offsetHeight,
          marginTop: s.marginTop,
          marginBottom: s.marginBottom,
          height: s.height
        };
      })
    };
  });

  console.log('--- CARD_DATA ---');
  console.log(JSON.stringify(data, null, 2));
  await browser.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});