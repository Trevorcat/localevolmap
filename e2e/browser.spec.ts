import { test, expect } from '@playwright/test';

test.describe('LocalEvomap Core E2E', () => {
    test.beforeEach(async ({ page, request }) => {
        await request.post('/api/reset');
        await page.goto('/');
        await expect(page.locator('h1')).toContainText('LocalEvomap');
    });

    test('should load UI and display initial stats', async ({ page }) => {
        await expect(page.locator('#val-genes')).toHaveText('0');
        await expect(page.locator('#val-capsules')).toHaveText('0');
        await expect(page.locator('#val-events')).toHaveText('0');
        
        // Take initial screenshot
        await page.screenshot({ path: 'e2e/screenshots/initial-load.png' });
    });

    test('should add genes and update stats', async ({ page }) => {
        await page.click('#btn-add-gene');
        
        // Wait for stats to update
        await expect(page.locator('#val-genes')).toHaveText('1');
        await expect(page.locator('#val-events')).toHaveText('1');
        
        // Check logs via View Events
        await page.click('#btn-view-events');
        await expect(page.locator('.log-container')).toContainText('Gene injected');
        
        await page.screenshot({ path: 'e2e/screenshots/after-add-gene.png' });
    });

    test('should add capsules and update stats', async ({ page }) => {
        await page.click('#btn-add-capsule');
        
        // Wait for stats to update
        await expect(page.locator('#val-capsules')).toHaveText('1');
        
        // Check logs via View Events
        await page.click('#btn-view-events');
        await expect(page.locator('.log-container')).toContainText('Capsule spawned');
        
        await page.screenshot({ path: 'e2e/screenshots/after-add-capsule.png' });
    });

    test('should execute evolution correctly', async ({ page }) => {
        // Try evolving without materials
        await page.click('#btn-evolve');
        await page.click('#btn-view-events');
        await expect(page.locator('.log-container')).toContainText('Evolution failed: Missing components');
        
        // Add materials
        await page.click('#btn-add-gene');
        await page.click('#btn-add-capsule');
        
        // Verify stats
        await expect(page.locator('#val-genes')).toHaveText('1');
        await expect(page.locator('#val-capsules')).toHaveText('1');
        
        // Evolve
        await page.click('#btn-evolve');
        
        // Verify materials consumed
        await expect(page.locator('#val-genes')).toHaveText('0');
        await expect(page.locator('#val-capsules')).toHaveText('0');
        
        // Check logs via View Events
        await page.click('#btn-view-events');
        await expect(page.locator('.log-container')).toContainText('Evolution sequence triggered. Mutating DNA...');
        
        await page.screenshot({ path: 'e2e/screenshots/after-evolution.png' });
    });
});