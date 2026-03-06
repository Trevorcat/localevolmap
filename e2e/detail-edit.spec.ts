import { test, expect, request as playwrightRequest } from '@playwright/test';

test.describe('Detail View and Edit Functionality', () => {
    test.beforeAll(async () => {
        const apiContext = await playwrightRequest.newContext({
            baseURL: 'http://localhost:3000',
            extraHTTPHeaders: { 'Authorization': 'test-api-key' }
        });

        // Seed 8 capsules
        for(let i=1; i<=8; i++) {
            await apiContext.post('/api/v1/capsules', {
                data: {
                    type: "Capsule",
                    schema_version: "1.0",
                    id: `cap-${i}`,
                    trigger: [`test-${i}`],
                    gene: `gene-${i}`,
                    summary: `Test capsule ${i}`,
                    confidence: 0.9,
                    changes: { files: [], post_commands: [] }
                }
            });
        }

        // Seed some genes
        for(let i=1; i<=3; i++) {
            await apiContext.post('/api/v1/genes', {
                data: {
                    type: "Gene",
                    id: `gene-${i}`,
                    category: "feature",
                    signals_match: [`signal-${i}`],
                    preconditions: [],
                    strategy: ["Initial strategy"],
                    constraints: {}
                }
            });
        }
    });

    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:3000');
        await page.waitForTimeout(500);
    });

    test('Step 1: Capsules page load', async ({ page }) => {
        await page.click('.nav-link:has-text("Capsules")');
        await page.waitForSelector('#capsules-tbody tr', { state: 'visible' });
        await page.waitForTimeout(500);
        
        // verify there's a view button
        const viewButtons = page.locator('#capsules-tbody button:has-text("View")');
        await expect(viewButtons.first()).toBeVisible();
        await page.screenshot({ path: 'public/e2e-test-capsules-page.png' });
    });

    test('Step 2 & 3: Gene detail view and edit', async ({ page }) => {
        await page.click('.nav-link:has-text("Genes")');
        await page.waitForSelector('#genes-tbody tr', { state: 'visible' });
        
        const viewBtn = page.locator('#genes-tbody button:has-text("View")').first();
        await expect(viewBtn).toBeVisible();
        await viewBtn.click();
        
        // Wait for modal
        const modal = page.locator('#modal-gene-detail');
        await expect(modal).toBeVisible();
        await page.waitForTimeout(500);
        
        // Step 2: Screenshot detail view
        await page.screenshot({ path: 'public/e2e-test-gene-detail.png' });
        
        // Switch to Edit tab
        const editTab = page.locator('#modal-gene-detail .modal-tab:has-text("编辑")');
        if (await editTab.isVisible()) {
             await editTab.click();
        } else {
             // Try generic edit tab
             const editTab2 = page.locator('#modal-gene-detail .modal-tab:has-text("Edit")');
             if (await editTab2.isVisible()) await editTab2.click();
        }
        await page.waitForTimeout(500);
        
        // Fill signals field since there is no "Name" field in Gene schema
        const signalsInput = page.locator('#e-g-signals');
        if (await signalsInput.isVisible()) {
            const oldVal = await signalsInput.inputValue();
            await signalsInput.fill(`[TEST] ${oldVal}`);
            
            // Save
            const saveBtn = page.locator('#modal-gene-detail button:has-text("Save Changes"), #modal-gene-detail button[type="submit"]');
            await saveBtn.click();
            await page.waitForTimeout(500);
        }
        
        // Screenshot after edit
        await page.screenshot({ path: 'public/e2e-test-gene-edit.png' });
    });

    test('Step 4: Capsule detail view and edit', async ({ page }) => {
        await page.click('.nav-link:has-text("Capsules")');
        await page.waitForSelector('#capsules-tbody tr', { state: 'visible' });
        
        const viewBtn = page.locator('#capsules-tbody button:has-text("View")').first();
        await expect(viewBtn).toBeVisible();
        await viewBtn.click();
        
        const modal = page.locator('#modal-capsule-detail');
        await expect(modal).toBeVisible();
        await page.waitForTimeout(500);
        await page.screenshot({ path: 'public/e2e-test-capsule-detail.png' });
        
        // Edit Capsule
        const editTab = page.locator('#modal-capsule-detail .modal-tab:has-text("编辑")');
        if (await editTab.isVisible()) {
            await editTab.click();
        } else {
            const editTab2 = page.locator('#modal-capsule-detail .modal-tab:has-text("Edit")');
            if (await editTab2.isVisible()) await editTab2.click();
        }
        await page.waitForTimeout(500);
        await page.screenshot({ path: 'public/e2e-test-capsule-edit.png' });
    });
});
