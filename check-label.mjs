import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('http://10.104.11.12:3000');
  await page.waitForTimeout(2000); // wait for render
  
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
