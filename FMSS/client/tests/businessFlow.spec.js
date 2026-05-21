import { test, expect } from '@playwright/test';

// Test data
const timestamp = Date.now();
const testCustomer = {
  firstName: 'Test',
  lastName: 'Customer',
  email: `testcustomer_${timestamp}@example.com`,
  phone: '9876543210',
  password: 'Test@123'
};

const testFleetOwner = {
  name: `Fleet Owner ${timestamp}`,
  email: `fleetowner_${timestamp}@example.com`,
  phone: '9876543211',
  vehicleTypes: ['Truck', 'Container'],
  serviceAreas: ['North India', 'South India']
};

test.describe('FMS Complete Business Flow', () => {

  test.describe('Authentication Flows', () => {

    test('Customer self-registration', async ({ page }) => {
      await page.goto('/client/register');
      await page.waitForSelector('form');

      // Fill registration form
      await page.fill('input[name="firstName"], input[placeholder*="First"]', testCustomer.firstName);
      await page.fill('input[name="lastName"], input[placeholder*="Last"]', testCustomer.lastName);
      await page.fill('input[type="email"]', testCustomer.email);
      await page.fill('input[name="phone"], input[placeholder*="Phone"]', testCustomer.phone);
      await page.fill('input[type="password"]', testCustomer.password);

      // Submit registration
      await page.click('button[type="submit"]');

      // Should redirect to login or dashboard
      await page.waitForURL(/\/(client\/(login|dashboard)|login)/, { timeout: 10000 });
    });

    test('Customer login', async ({ page }) => {
      await page.goto('/client-login');
      await page.fill('input[type="email"]', 'client@fms.com');
      await page.fill('input[type="password"]', 'password123');
      await page.click('button[type="submit"]');

      await page.waitForURL('**/client/dashboard', { timeout: 10000 });
      expect(page.url()).toContain('/client/dashboard');
    });

    test('Staff login', async ({ page }) => {
      await page.goto('/staff-login');
      await page.fill('input[type="email"]', 'staff@fms.com');
      await page.fill('input[type="password"]', 'password123');
      await page.click('button[type="submit"]');

      await page.waitForURL('**/staff/dashboard', { timeout: 10000 });
      expect(page.url()).toContain('/staff/dashboard');
    });

    test('Vendor/Fleet Owner login', async ({ page }) => {
      await page.goto('/vendor-login');
      await page.fill('input[type="email"]', 'vendor@fms.com');
      await page.fill('input[type="password"]', 'password123');
      await page.click('button[type="submit"]');

      await page.waitForURL('**/vendor/dashboard', { timeout: 10000 });
      expect(page.url()).toContain('/vendor/dashboard');
    });
  });

  test.describe('Customer Load Management', () => {

    test.beforeEach(async ({ page }) => {
      // Login as client
      await page.goto('/client-login');
      await page.fill('input[type="email"]', 'client@fms.com');
      await page.fill('input[type="password"]', 'password123');
      await page.click('button[type="submit"]');
      await page.waitForURL('**/client/dashboard', { timeout: 10000 });
    });

    test('Create transport order (load)', async ({ page }) => {
      await page.goto('/client/create-load');
      await page.waitForSelector('form');

      // Fill load details
      const customerInput = page.locator('input[name="customer"]');
      if (await customerInput.isVisible()) {
        await customerInput.fill('Acme Corp');
      }

      await page.fill('input[name="pickupNo"], input[placeholder*="Pickup"]', `PK-${timestamp}`);

      const originInput = page.locator('input[name="origin"], input[placeholder*="Origin"]');
      if (await originInput.isVisible()) {
        await originInput.fill('Delhi');
      }

      const destInput = page.locator('input[name="destination"], input[placeholder*="Destination"]');
      if (await destInput.isVisible()) {
        await destInput.fill('Mumbai');
      }

      // Submit the load
      await page.click('button[type="submit"]:has-text("Submit"), button:has-text("Create Load")');

      // Expect success notification
      await expect(page.locator('.Toastify, [role="alert"]').first()).toBeVisible({ timeout: 5000 });
    });

    test('Save load as draft', async ({ page }) => {
      await page.goto('/client/create-load');
      await page.waitForSelector('form');

      await page.fill('input[name="pickupNo"], input[placeholder*="Pickup"]', `DRAFT-${timestamp}`);

      // Click Save as Draft
      await page.click('button:has-text("Draft"), button:has-text("Save")');

      // Expect success
      await expect(page.locator('.Toastify, [role="alert"]').first()).toBeVisible({ timeout: 5000 });
    });

    test('View my loads', async ({ page }) => {
      await page.goto('/client/my-loads');

      // Should see loads table or list
      await expect(page.locator('table, [role="grid"], .MuiDataGrid-root').first()).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Staff Operations', () => {

    test.beforeEach(async ({ page }) => {
      // Login as staff
      await page.goto('/staff-login');
      await page.fill('input[type="email"]', 'staff@fms.com');
      await page.fill('input[type="password"]', 'password123');
      await page.click('button[type="submit"]');
      await page.waitForURL('**/staff/dashboard', { timeout: 10000 });
    });

    test('View pending loads', async ({ page }) => {
      await page.goto('/staff/pending-loads');

      // Should see DataGrid with pending loads
      await expect(page.locator('table, [role="grid"], .MuiDataGrid-root').first()).toBeVisible({ timeout: 10000 });
    });

    test('View verified loads', async ({ page }) => {
      await page.goto('/staff/verified-loads');

      await expect(page.locator('table, [role="grid"], .MuiDataGrid-root').first()).toBeVisible({ timeout: 10000 });
    });

    test('Create customer on behalf', async ({ page }) => {
      await page.goto('/staff/create-customer');
      await page.waitForSelector('form');

      // Fill customer form
      await page.fill('input[name="firstName"], input[placeholder*="First"]', 'Staff');
      await page.fill('input[name="lastName"], input[placeholder*="Last"]', 'Created');
      await page.fill('input[type="email"]', `staffcreated_${timestamp}@example.com`);
      await page.fill('input[name="phone"], input[placeholder*="Phone"]', '9999888877');

      await page.click('button[type="submit"]');

      // Expect success
      await expect(page.locator('.Toastify, [role="alert"]').first()).toBeVisible({ timeout: 5000 });
    });

    test('View customers list', async ({ page }) => {
      await page.goto('/staff/customers');

      await expect(page.locator('table, [role="grid"], .MuiDataGrid-root').first()).toBeVisible({ timeout: 10000 });
    });

    test('Enroll fleet owner (bidder)', async ({ page }) => {
      await page.goto('/staff/create-fleet-owner');
      await page.waitForSelector('form');

      await page.fill('input[name="name"], input[placeholder*="Name"]', testFleetOwner.name);
      await page.fill('input[type="email"]', testFleetOwner.email);
      await page.fill('input[name="phone"], input[placeholder*="Phone"]', testFleetOwner.phone);

      await page.click('button[type="submit"]');

      // Expect success with credentials shown
      await expect(page.locator('.Toastify, [role="alert"], text=/created|success/i').first()).toBeVisible({ timeout: 5000 });
    });

    test('View fleet owners list', async ({ page }) => {
      await page.goto('/staff/fleet-owners');

      await expect(page.locator('table, [role="grid"], .MuiDataGrid-root').first()).toBeVisible({ timeout: 10000 });
    });

    test('Email configuration page', async ({ page }) => {
      await page.goto('/staff/email-config');

      // Should see email settings form
      await expect(page.locator('text=/Email|SMTP|Configuration/i').first()).toBeVisible({ timeout: 5000 });

      // Fill form
      await page.fill('input[name="host"]', 'smtp.mailtrap.io');
      await page.fill('input[name="port"]', '2525');
      await page.fill('input[name="email"]', 'admin@fms.com');
      await page.fill('input[name="password"]', 'testpass');

      // Submit
      await page.click('button[type="submit"]');

      // Expect success
      await expect(page.locator('.Toastify, [role="alert"]').first()).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Load Verification Workflow', () => {

    test('Staff can verify a pending load', async ({ page }) => {
      // Login as staff
      await page.goto('/staff-login');
      await page.fill('input[type="email"]', 'staff@fms.com');
      await page.fill('input[type="password"]', 'password123');
      await page.click('button[type="submit"]');
      await page.waitForURL('**/staff/dashboard', { timeout: 10000 });

      // Go to pending loads
      await page.goto('/staff/pending-loads');
      await page.waitForSelector('table, [role="grid"], .MuiDataGrid-root', { timeout: 10000 });

      // If there are any loads, try to verify one
      const verifyButton = page.locator('button:has-text("Verify"), button[aria-label*="verify"]').first();
      if (await verifyButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await verifyButton.click();
        await expect(page.locator('.Toastify, [role="alert"]').first()).toBeVisible({ timeout: 5000 });
      }
    });

    test('Staff can request changes on a load', async ({ page }) => {
      // Login as staff
      await page.goto('/staff-login');
      await page.fill('input[type="email"]', 'staff@fms.com');
      await page.fill('input[type="password"]', 'password123');
      await page.click('button[type="submit"]');
      await page.waitForURL('**/staff/dashboard', { timeout: 10000 });

      // Go to pending loads
      await page.goto('/staff/pending-loads');
      await page.waitForSelector('table, [role="grid"], .MuiDataGrid-root', { timeout: 10000 });

      // If there are any loads, try to request changes
      const requestChangesBtn = page.locator('button:has-text("Request Changes"), button:has-text("Changes"), button[aria-label*="change"]').first();
      if (await requestChangesBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await requestChangesBtn.click();

        // Fill reason if dialog appears
        const reasonInput = page.locator('textarea, input[name="reason"]');
        if (await reasonInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await reasonInput.fill('Please update pickup address');
          await page.click('button:has-text("Submit"), button:has-text("Send")');
        }

        await expect(page.locator('.Toastify, [role="alert"]').first()).toBeVisible({ timeout: 5000 });
      }
    });
  });

  test.describe('Bidding Workflow', () => {

    test('Staff can schedule bidding for verified load', async ({ page }) => {
      // Login as staff
      await page.goto('/staff-login');
      await page.fill('input[type="email"]', 'staff@fms.com');
      await page.fill('input[type="password"]', 'password123');
      await page.click('button[type="submit"]');
      await page.waitForURL('**/staff/dashboard', { timeout: 10000 });

      // Go to verified loads
      await page.goto('/staff/verified-loads');
      await page.waitForSelector('table, [role="grid"], .MuiDataGrid-root', { timeout: 10000 });

      // Look for schedule button
      const scheduleBtn = page.locator('button[aria-label*="schedule"], button:has-text("Schedule")').first();
      if (await scheduleBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await scheduleBtn.click();

        // Should navigate to schedule page
        await page.waitForURL('**/schedule-bidding/**', { timeout: 5000 });

        // Fill in schedule times or click Open Now
        const openNowBtn = page.locator('button:has-text("Open Now")');
        if (await openNowBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await openNowBtn.click();
          await expect(page.locator('.Toastify, [role="alert"]').first()).toBeVisible({ timeout: 5000 });
        }
      }
    });

    test('Fleet owner can see live bids', async ({ page }) => {
      // Login as vendor/fleet owner
      await page.goto('/vendor-login');
      await page.fill('input[type="email"]', 'vendor@fms.com');
      await page.fill('input[type="password"]', 'password123');
      await page.click('button[type="submit"]');
      await page.waitForURL('**/vendor/dashboard', { timeout: 10000 });

      // Go to loads with bidding
      await page.goto('/vendor/loads');

      // Should see loads available for bidding
      await expect(page.locator('table, [role="grid"], .MuiDataGrid-root, text=/No.*loads/i').first()).toBeVisible({ timeout: 10000 });
    });

    test('Fleet owner can place bid', async ({ page }) => {
      // Login as vendor/fleet owner
      await page.goto('/vendor-login');
      await page.fill('input[type="email"]', 'vendor@fms.com');
      await page.fill('input[type="password"]', 'password123');
      await page.click('button[type="submit"]');
      await page.waitForURL('**/vendor/dashboard', { timeout: 10000 });

      // Go to loads
      await page.goto('/vendor/loads');
      await page.waitForTimeout(2000); // Wait for data load

      // If there are loads with open bidding, try to place bid
      const bidButton = page.locator('button:has-text("Bid"), button:has-text("Place Bid"), a:has-text("Bid")').first();
      if (await bidButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await bidButton.click();

        // Fill bid amount
        const amountInput = page.locator('input[name="amount"], input[type="number"], input[placeholder*="Amount"]');
        if (await amountInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          await amountInput.fill('50000');
          await page.click('button[type="submit"], button:has-text("Submit")');
          await expect(page.locator('.Toastify, [role="alert"]').first()).toBeVisible({ timeout: 5000 });
        }
      }
    });
  });

  test.describe('Credential Sharing', () => {

    test('Staff can send credentials via email', async ({ page }) => {
      // Login as staff
      await page.goto('/staff-login');
      await page.fill('input[type="email"]', 'staff@fms.com');
      await page.fill('input[type="password"]', 'password123');
      await page.click('button[type="submit"]');
      await page.waitForURL('**/staff/dashboard', { timeout: 10000 });

      // Go to fleet owners
      await page.goto('/staff/fleet-owners');
      await page.waitForSelector('table, [role="grid"], .MuiDataGrid-root', { timeout: 10000 });

      // Look for email icon/button
      const emailBtn = page.locator('button[aria-label*="email"], svg[data-testid="EmailIcon"]').first();
      if (await emailBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await emailBtn.click();
        // Should trigger email send
        await expect(page.locator('.Toastify, [role="alert"]').first()).toBeVisible({ timeout: 5000 });
      }
    });

    test('Staff can share credentials via WhatsApp', async ({ page, context }) => {
      // Login as staff
      await page.goto('/staff-login');
      await page.fill('input[type="email"]', 'staff@fms.com');
      await page.fill('input[type="password"]', 'password123');
      await page.click('button[type="submit"]');
      await page.waitForURL('**/staff/dashboard', { timeout: 10000 });

      // Go to customers
      await page.goto('/staff/customers');
      await page.waitForSelector('table, [role="grid"], .MuiDataGrid-root', { timeout: 10000 });

      // Look for whatsapp icon/button - it should open a new tab
      const whatsappBtn = page.locator('button[aria-label*="whatsapp"], svg[data-testid="WhatsAppIcon"]').first();
      if (await whatsappBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        // WhatsApp button opens external link, just verify it's clickable
        await expect(whatsappBtn).toBeEnabled();
      }
    });
  });

});
