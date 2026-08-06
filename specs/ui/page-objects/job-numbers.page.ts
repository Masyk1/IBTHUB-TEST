import { expect, type Locator, type Page } from '@playwright/test';
import type { JobListEntry } from '@utils/types';
import { BasePage } from './base.page';

export class JobNumbersPage extends BasePage {
  private readonly heading: Locator;
  private readonly searchInput: Locator;
  private readonly noDispatchesMessage: Locator;
  private readonly dateInput: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole('heading', { name: 'Job List', exact: true });
    this.searchInput = page.getByPlaceholder('search job number');
    this.noDispatchesMessage = page.getByRole('heading', { name: /no dispatches today/i });
    this.dateInput = page.locator('input.flatpickr-input[readonly]').first();
  }

  async toBeLoaded(): Promise<void> {
    await expect(this.heading).toBeVisible();
    await expect(this.searchInput).toBeVisible();
  }

  async getAllJobNumbers(): Promise<string[]> {
    return (await this.getAllJobEntries()).map((entry) => entry.jobNumber);
  }

  async getAllJobEntries(): Promise<JobListEntry[]> {
    await this.toBeLoaded();

    const jobNumberItems = this.page.locator('a.list-group-item[href^="/jobnumbers/"] span.font-weight-bold');
    await expect
      .poll(async () => (await jobNumberItems.count()) > 0 || (await this.noDispatchesMessage.isVisible()), {
        message: 'Expected Job Numbers or the "No dispatches today" empty state.',
        timeout: 45_000,
      })
      .toBe(true);

    if (await this.noDispatchesMessage.isVisible()) {
      return [];
    }

    const entries = await this.page.locator('a.list-group-item[href^="/jobnumbers/"]').evaluateAll((links) =>
      links.map((link) => ({
        jobNumber: link.textContent?.trim() ?? '',
        href: link.getAttribute('href') ?? '',
      }))
    );
    const validEntries = entries.filter((entry) => entry.jobNumber.length > 0 && entry.href.length > 0);
    await expect(jobNumberItems).toHaveCount(validEntries.length);

    return validEntries;
  }

  async selectDispatchDate(date: string): Promise<void> {
    const parsedDate = new Date(`${date}T12:00:00`);
    if (Number.isNaN(parsedDate.getTime())) throw new Error(`Invalid dispatch date: ${date}`);
    if ((await this.dateInput.inputValue()) === date) return;

    const firstJobLink = this.page.locator('a.list-group-item[href^="/jobnumbers/"]').first();
    const previousFirstJobHref = (await firstJobLink.count()) > 0 ? await firstJobLink.getAttribute('href') : null;

    await this.dateInput.click();
    const calendar = this.page.locator('.flatpickr-calendar.open');
    await expect(calendar).toBeVisible();

    const yearInput = calendar.locator('input.cur-year');
    await yearInput.fill(String(parsedDate.getFullYear()));
    await yearInput.press('Enter');

    await calendar.locator('select.flatpickr-monthDropdown-months').selectOption(String(parsedDate.getMonth()));
    const ariaLabel = new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(parsedDate);
    const day = calendar.locator(`.flatpickr-day[aria-label="${ariaLabel}"]:not(.prevMonthDay):not(.nextMonthDay)`);

    await day.click();
    await expect(this.dateInput).toHaveValue(date);
    await expect
      .poll(
        async () => {
          if (await this.noDispatchesMessage.isVisible()) return true;
          if ((await firstJobLink.count()) === 0) return false;
          return (await firstJobLink.getAttribute('href')) !== previousFirstJobHref;
        },
        {
          message: `Expected the Job List to refresh for ${date}.`,
          timeout: 45_000,
        }
      )
      .toBe(true);
  }

  async selectConfiguredDispatchDate(date: string | undefined): Promise<void> {
    if (!date) return;
    await this.selectDispatchDate(date);
  }
}
