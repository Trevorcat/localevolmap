import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('http://10.104.11.12:3000');
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
           gridRowHeight: window.getComputedStyle(card.parentElement).gridTemplateRows,
           valueHeight: window.getComputedStyle(el).height
         });
       }, 500);
    });
  });
  console.log('--- TEST TALL ---');
  console.log(JSON.stringify(data, null, 2));

  await browser.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
