import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('http://10.104.11.12:3000/#genes');
  await page.waitForTimeout(2000); // Wait for route transition and fetch
  
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
