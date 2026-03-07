import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(`${BASE_URL}/#genes`);
  await page.waitForTimeout(2000);

  const genesData = await page.evaluate(() => {
    const pageGenes = document.getElementById('page-genes');
    if (!pageGenes || !pageGenes.classList.contains('active')) return null;
    const glassCard = pageGenes.querySelector('.glass-card');
    if (!glassCard) return null;
    const styles = window.getComputedStyle(glassCard);
    return {
      height: styles.height,
      boundingHeight: glassCard.getBoundingClientRect().height,
      padding: styles.padding,
      boxSizing: styles.boxSizing,
      marginBottom: styles.marginBottom
    };
  });

  console.log('--- GENES_DATA ---');
  console.log(JSON.stringify(genesData, null, 2));
  await browser.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});