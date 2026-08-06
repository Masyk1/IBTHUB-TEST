import { expect, type Page } from '@playwright/test';
import { BasePage } from './base.page';

export class HomePage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async toBeLoaded(): Promise<void> {
    await expect(this.page.locator('body')).toBeVisible();
  }
}
