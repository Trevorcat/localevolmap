import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto(BASE_URL);
  await page.waitForTimeout(2000); // Wait for render
  
  const data = await page.evaluate(() => {
    const el = document.querySelector('.stat-value');
    if(el) {
       el.innerHTML = "1,000,000,000,000<br/>Extra Line<br/>Extra Line2";
    }
    return new Promise(resolve => {
       setTimeout(() => {
         const card = document.querySelector('.stat-card');
         const styles = window.getComputedStyle(card);
         resolve({
            cardHeight: styles.height,
            cardScrollHeight: card.scrollHeight,
            cardClientHeight: card.clientHeight,
            bodyHeight: document.body.scrollHeight,
            html: card.innerHTML,
            statValue: card.querySelector('.stat-value')?.outerHTML,
            statLabel: card.querySelector('.stat-label')?.outerHTML
         });
       }, 100);
    });
  });
  console.log(JSON.stringify(data, null, 2));

  await browser.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});