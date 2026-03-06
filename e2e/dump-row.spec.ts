import { test } from '@playwright/test';
import fs from 'fs';

test('Dump row', async ({ page, request }) => {
    // Add genes
    await request.post('http://localhost:3000/api/gene');
    await request.post('http://localhost:3000/api/capsule');
    
    await page.goto('http://localhost:3000');
    await page.waitForTimeout(1000);
    
    await page.click('.nav-link:has-text("Genes")');
    await page.waitForTimeout(1000);
    const tbody = await page.locator('#genes-tbody').innerHTML();
    fs.writeFileSync('genes-tbody.html', tbody);
    
    await page.click('.nav-link:has-text("Capsules")');
    await page.waitForTimeout(1000);
    const ctbody = await page.locator('#capsules-tbody').innerHTML();
    fs.writeFileSync('capsules-tbody.html', ctbody);
});
