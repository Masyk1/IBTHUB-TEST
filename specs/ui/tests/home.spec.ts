import { test } from '@playwright/test';
import { HomePage } from '@ui/page-objects/home.page';

test.describe('IBT Hub home page', () => {
  test('opens successfully @smoke', async ({ page }) => {
    const homePage = new HomePage(page);
    await homePage.open();
  });
});
