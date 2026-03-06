import { chromium } from 'playwright';
import fs from 'fs';

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  // Ensure public directory exists for the screenshot
  if (!fs.existsSync('public')) {
    fs.mkdirSync('public');
  }

  await page.goto('http://10.104.11.12:3000');
  await page.waitForTimeout(2000); // wait for render
  
  // take screenshot
  await page.screenshot({ path: 'public/e2e-dashboard-actual-render.png' });
  
  const data = await page.evaluate(() => {
    function getStyles(selector) {
      const el = document.querySelector(selector);
      if (!el) return null;
      const styles = window.getComputedStyle(el);
      return {
        height: styles.height,
        width: styles.width,
        padding: styles.padding,
        margin: styles.margin,
        boxSizing: styles.boxSizing,
        display: styles.display,
        flex: styles.flex,
        gridTemplateRows: styles.gridTemplateRows,
        fontSize: styles.fontSize,
        lineHeight: styles.lineHeight,
        overflow: styles.overflow,
        maxHeight: styles.maxHeight,
        minHeight: styles.minHeight,
        boundingHeight: el.getBoundingClientRect().height
      };
    }
    
    return {
      statsGrid: getStyles('.stats-grid'),
      statCard: getStyles('.stat-card'),
      glassCard: getStyles('.glass-card'),
      statValue: getStyles('.stat-value')
    };
  });
  console.log('--- DASHBOARD_DATA ---');
  console.log(JSON.stringify(data, null, 2));

  await page.goto('http://10.104.11.12:3000/genes');
  await page.waitForTimeout(2000);
  const genesData = await page.evaluate(() => {
    const el = document.querySelector('.glass-card');
    if (!el) return null;
    const styles = window.getComputedStyle(el);
    return {
      height: styles.height,
      boundingHeight: el.getBoundingClientRect().height
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
