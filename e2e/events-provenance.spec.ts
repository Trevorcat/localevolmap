import { test, expect } from '@playwright/test';

test.describe('Events provenance UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.request.post('/api/reset');
  });

  test('shows explicit labels for no knowledge and capsule-only events', async ({ page }) => {
    await page.request.post('/api/v1/feedback', {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-api-key'
      },
      data: {
        signals: ['ui-provenance', 'no-knowledge'],
        summary: 'No knowledge recorded event',
        outcome: { status: 'success', score: 0.72 },
        create_capsule: false,
        knowledge_status: 'no_knowledge_used'
      }
    });

    await page.request.post('/api/v1/feedback', {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-api-key'
      },
      data: {
        signals: ['ui-provenance', 'capsule-only'],
        used_capsule: 'capsule_demo_only',
        summary: 'Capsule only event',
        outcome: { status: 'success', score: 0.81 },
        create_capsule: false,
        knowledge_status: 'capsule_only'
      }
    });

    await page.goto('/#events');
    await expect(page.locator('#events-timeline strong').filter({ hasText: 'No knowledge recorded' }).first()).toBeVisible();
    await expect(page.locator('#events-timeline strong').filter({ hasText: 'Capsule used (gene unrecorded)' }).first()).toBeVisible();

    await page.goto('/#dashboard');
    await expect(page.locator('#dashboard-timeline').getByText('No knowledge recorded — success').first()).toBeVisible();
  });
});


