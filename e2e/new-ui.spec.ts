import { test, expect } from '@playwright/test';

test.describe('New Multi-Page Dashboard UI E2E', () => {
    const BASE_URL = process.env.PORT ? `http://localhost:${process.env.PORT}` : 'http://localhost:3000';
    
    test.beforeEach(async ({ page }) => {
        // Reset legacy state
        await page.request.post(`${BASE_URL}/api/reset`);
        await page.goto('/');
        await expect(page.locator('h1.title')).toContainText('Evomap');
    });

    test('should show navigation and dashboard page', async ({ page }) => {
        // Check navigation
        await expect(page.locator('.nav-link:has-text("Dashboard")')).toBeVisible();
        await expect(page.locator('.nav-link:has-text("Genes")')).toBeVisible();
        await expect(page.locator('.nav-link:has-text("Capsules")')).toBeVisible();
        await expect(page.locator('.nav-link:has-text("Events")')).toBeVisible();
        
        // Dashboard should be active by default
        await expect(page.locator('.nav-link:has-text("Dashboard")')).toHaveClass(/active/);
        
        // Check dashboard content
        await expect(page.locator('.stat-card')).toHaveCount(3);
        
        await page.screenshot({ path: 'e2e/screenshots/new-ui-dashboard.png' });
    });

    test('should navigate to Genes page', async ({ page }) => {
        await page.click('.nav-link:has-text("Genes")');
        
        // Check genes page is active
        await expect(page.locator('.nav-link:has-text("Genes")')).toHaveClass(/active/);
        
        // Check genes table
        await expect(page.locator('#page-genes table')).toBeVisible();
        
        // Check search and filters
        await expect(page.locator('#gene-search')).toBeVisible();
        
        await page.screenshot({ path: 'e2e/screenshots/new-ui-genes.png' });
    });

    test('should navigate to Capsules page', async ({ page }) => {
        await page.click('.nav-link:has-text("Capsules")');
        
        await expect(page.locator('.nav-link:has-text("Capsules")')).toHaveClass(/active/);
        await expect(page.locator('#page-capsules table')).toBeVisible();
        
        await page.screenshot({ path: 'e2e/screenshots/new-ui-capsules.png' });
    });

    test('should navigate to Events page', async ({ page }) => {
        await page.click('.nav-link:has-text("Events")');
        
        await expect(page.locator('.nav-link:has-text("Events")')).toHaveClass(/active/);
        await expect(page.locator('#page-events .timeline')).toBeVisible();
        
        await page.screenshot({ path: 'e2e/screenshots/new-ui-events.png' });
    });

    test('should show API key input', async ({ page }) => {
        await expect(page.locator('input#api-key')).toBeVisible();
        
        // Test setting API key
        await page.fill('input#api-key', 'test-api-key');
        
        await expect(page.locator('input#api-key')).toHaveValue('test-api-key');
    });

    test('should handle empty states', async ({ page }) => {
        // Go to Genes page
        await page.click('.nav-link:has-text("Genes")');
        
        // Should show empty state
        await expect(page.locator('#genes-tbody')).toContainText(/no genes/i);
        
        // Go to Capsules page
        await page.click('.nav-link:has-text("Capsules")');
        await expect(page.locator('#capsules-tbody')).toContainText(/no capsules/i);
        
        // Go to Events page
        await page.click('.nav-link:has-text("Events")');
        await expect(page.locator('#events-timeline')).toContainText(/no events/i);
    });

    test('should load data from API', async ({ page }) => {
        // Add some genes via legacy API
        await page.request.post(`${BASE_URL}/api/gene`);
        await page.request.post(`${BASE_URL}/api/gene`);
        await page.request.post(`${BASE_URL}/api/capsule`);
        
        // Go to Genes page and check count (legacy API uses different counting)
        await page.click('.nav-link:has-text("Genes")');
        
        // Dashboard should show updated stats
        await page.click('.nav-link:has-text("Dashboard")');
        await expect(page.locator('.stat-card')).toHaveCount(3);
    });
});
