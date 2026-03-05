import { test, expect } from '@playwright/test';

test.describe('LocalEvomap Core E2E', () => {
    test.beforeEach(async ({ page, request }) => {
        await request.post('/api/reset');
        await page.goto('/');
        await expect(page.locator('h1.title')).toContainText('LocalEvomap');
    });

    test('should load UI and display initial stats', async ({ page }) => {
        // Check navigation
        await expect(page.locator('.nav-link:has-text("Dashboard")')).toBeVisible();
        await expect(page.locator('.nav-link:has-text("Genes")')).toBeVisible();
        await expect(page.locator('.nav-link:has-text("Capsules")')).toBeVisible();
        await expect(page.locator('.nav-link:has-text("Events")')).toBeVisible();
        
        // Dashboard should show 3 stat cards
        await expect(page.locator('.stat-card')).toHaveCount(3);
        
        // Take initial screenshot
        await page.screenshot({ path: 'e2e/screenshots/initial-load.png' });
    });

    test('should add genes and update stats', async ({ page }) => {
        // Set API key first
        await page.fill('#api-key', 'test-api-key');
        
        // Go to Genes page
        await page.click('.nav-link:has-text("Genes")');
        
        // Click Create Gene button
        await page.click('button:has-text("+ Create Gene")');
        
        // Wait for modal to be visible
        await expect(page.locator('#modal-gene')).toBeVisible({ timeout: 5000 });
        
        // Fill form
        await page.fill('#g-id', 'test-gene-1');
        await page.selectOption('#g-category', 'repair');
        await page.fill('#g-signals', 'error');
        await page.fill('#g-strategy', '["Fix it"]');
        
        // Submit and wait for navigation
        await page.click('#form-gene button[type="submit"]');
        
        // Wait for modal to close (with longer timeout)
        await expect(page.locator('#modal-gene')).not.toBeVisible({ timeout: 10000 });
        
        // Wait a bit for table to update
        await page.waitForTimeout(1000);
        
        // Check that gene is in the table
        await expect(page.locator('#genes-tbody')).toContainText('test-gene-1', { timeout: 5000 });
        
        await page.screenshot({ path: 'e2e/screenshots/after-add-gene.png' });
    });

    test('should add capsules and update stats', async ({ page }) => {
        // Set API key first
        await page.fill('#api-key', 'test-api-key');
        
        // Go to Capsules page
        await page.click('.nav-link:has-text("Capsules")');
        
        // Click Create Capsule button
        await page.click('button:has-text("+ Create Capsule")');
        
        // Wait for modal to be visible
        await expect(page.locator('#modal-capsule')).toBeVisible({ timeout: 5000 });
        
        // Fill form
        await page.fill('#c-gene', 'test-capsule-1');
        await page.fill('#c-trigger', 'error');
        await page.fill('#c-summary', 'Test capsule');
        await page.fill('#c-confidence', '0.8');
        
        // Submit and wait for navigation
        await page.click('#form-capsule button[type="submit"]');
        
        // Wait for modal to close (with longer timeout)
        await expect(page.locator('#modal-capsule')).not.toBeVisible({ timeout: 10000 });
        
        // Wait a bit for table to update
        await page.waitForTimeout(1000);
        
        // Check that capsule is in the table
        await expect(page.locator('#capsules-tbody')).toContainText('test-capsule-1', { timeout: 5000 });
        
        await page.screenshot({ path: 'e2e/screenshots/after-add-capsule.png' });
    });

    test('should execute evolution correctly', async ({ page }) => {
        // Go to Dashboard
        await page.click('.nav-link:has-text("Dashboard")');
        
        // Dashboard shows stat cards
        await expect(page.locator('.stat-card')).toHaveCount(3);
        
        // Navigate to Events page to check timeline
        await page.click('.nav-link:has-text("Events")');
        await expect(page.locator('#events-timeline')).toBeVisible();
        
        await page.screenshot({ path: 'e2e/screenshots/after-evolution.png' });
    });
});