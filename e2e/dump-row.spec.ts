import { test, expect } from '@playwright/test';
import fs from 'fs';

test('Dump row', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);
    
    await page.click('.nav-link:has-text("Genes")');
    await page.waitForTimeout(1000);
    await expect(page.locator('#genes-tbody')).toBeVisible();
    const tbody = await page.locator('#genes-tbody').innerHTML();
    fs.writeFileSync('genes-tbody.html', tbody);
    
    await page.click('.nav-link:has-text("Capsules")');
    await page.waitForTimeout(1000);
    await expect(page.locator('#capsules-tbody')).toBeVisible();
    const ctbody = await page.locator('#capsules-tbody').innerHTML();
    fs.writeFileSync('capsules-tbody.html', ctbody);
});
