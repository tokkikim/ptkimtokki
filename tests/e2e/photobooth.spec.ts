import { test, expect } from '@playwright/test';

test.describe('PhotoBooth E2E', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('should load the homepage and display title', async ({ page }) => {
        await expect(page).toHaveTitle(/키치 인생네컷/);
        // Default theme is Simple
        await expect(page.getByText('SIMPLE BOOTH', { exact: true })).toBeVisible();
    });

    test('should switch themes', async ({ page }) => {
        // Switch to Kitsch theme
        await page.getByRole('button', { name: '💖 Kitsch' }).click();
        await expect(page.getByText('KITSCH SNAP')).toBeVisible();

        // Switch to Neon theme
        await page.getByRole('button', { name: '💜 Neon' }).click();
        await expect(page.getByText('NEON STUDIO')).toBeVisible();
    });

    test('should complete photo session flow', async ({ page }) => {
        // Default is Simple theme, button is "Start Shooting"
        await page.getByRole('button', { name: 'Start Shooting' }).click();

        // Wait for countdown and capture (4 shots * (3s countdown + capture time))
        // This might take a while, so we increase timeout
        test.setTimeout(30000);

        // We expect the status to change to 'finished' eventually
        // The "Download" button appears when finished (Simple theme: "이미지 저장" might be same? Check code)
        // In PhotoBooth.tsx: {theme === 'simple' ? 'Start Shooting' : '촬영 시작'}
        // But download button: {theme === 'simple' ? 'Start Shooting' : '촬영 시작'} is for start.
        // Download button text: "이미지 저장" (seems constant? No, let's check)
        // Line 510: "이미지 저장" -> It is hardcoded.
        // Retake button: "다시 찍기" -> Hardcoded.

        await expect(page.getByRole('button', { name: '이미지 저장' })).toBeVisible({ timeout: 20000 });
        await expect(page.getByRole('button', { name: '다시 찍기' })).toBeVisible();
    });
});
