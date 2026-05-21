import { test, expect } from '@playwright/test';

test.describe('FMS Authentication & Dashboard Flow', () => {

  // Generate unique email to avoid "User already exists" issues across reruns
  const uniqueEmail = `testuser_${Date.now()}@example.com`;

  test('should register, login, and access dashboard', async ({ page }) => {

    // 1. Visit Registration Page
    await page.goto('http://localhost:5173/client/register');

    // Wait for form to appear
    await page.waitForSelector('form');

    // Fill in registration details based on typical mock (firstName, lastName, email, password)
    // Note: Assuming there are input fields with name or standard labels. Since we didn't see the exact DOM,
    // we'll try common selectors and graceful fallbacks.

    const inputs = await page.locator('input').all();

    // Try to heuristically fill the form
    for (const input of inputs) {
       const type = await input.getAttribute('type');
       const name = await input.getAttribute('name');
       const placeholder = await input.getAttribute('placeholder') || "";

       const lowerName = (name || placeholder).toLowerCase();

       if (lowerName.includes('first')) {
           await input.fill('Demo');
       } else if (lowerName.includes('last')) {
           await input.fill('User');
       } else if (type === 'email' || lowerName.includes('email')) {
           await input.fill(uniqueEmail);
       } else if (type === 'password' || lowerName.includes('password')) {
           await input.fill('password123');
       }
    }

    // Submit the form
    await page.locator('button[type="submit"], button:has-text("Register"), button:has-text("Sign Up")').click();

    // 2. We should be redirected to either login or dashboard
    // Let's assume the flow goes straight to the dashboard or to the login page.
    await page.waitForURL('http://localhost:5173/client/dashboard', { timeout: 10000 }).catch(async () => {
       // If it redirects to login instead of auto-login
       if (page.url().includes('login')) {
           const emailInput = page.locator('input[type="email"], input[name="email"]');
           await emailInput.fill(uniqueEmail);

           const passInput = page.locator('input[type="password"], input[name="password"]');
           await passInput.fill('password123');

           await page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign In")').click();
           await page.waitForURL('http://localhost:5173/*/dashboard', { timeout: 10000 });
       }
    });

    // 3. Verify Dashboard Access
    expect(page.url()).toContain('/dashboard');

    // Check if some dashboard text is visible
    await expect(page.locator('text="Dashboard"')).toBeVisible();

    console.log("Successfully registered & logged in as:", uniqueEmail);
  });
});
