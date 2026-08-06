import { expect, type Page } from '@playwright/test';

export abstract class BasePage {
  protected constructor(protected readonly page: Page) {}

  abstract toBeLoaded(): Promise<void>;

  async open(path = '/'): Promise<void> {
    await this.page.goto(path, { waitUntil: 'domcontentloaded' });
    await this.toBeLoaded();
  }

  async shouldHavePath(path: string | RegExp): Promise<void> {
    await expect(this.page).toHaveURL(path);
  }
}
