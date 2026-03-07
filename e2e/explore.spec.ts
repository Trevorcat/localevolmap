import { test, expect } from '@playwright/test';
import fs from 'fs';

test('Explore DOM', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    // Click Genes
    await page.click('.nav-link:has-text("Genes")');
    await page.waitForTimeout(2000);
    const genesHtml = await page.content();
    fs.writeFileSync('genes-dom.html', genesHtml);

    // Click Capsules
    await page.click('.nav-link:has-text("Capsules")');
    await page.waitForTimeout(2000);
    const capsulesHtml = await page.content();
    fs.writeFileSync('capsules-dom.html', capsulesHtml);
});
