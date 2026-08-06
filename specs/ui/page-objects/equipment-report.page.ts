import { expect, type Locator, type Page } from '@playwright/test';
import type { EquipmentReportArtifact, EquipmentReportRecord } from '@utils/types';
import { BasePage } from './base.page';

export class EquipmentReportPage extends BasePage {
  private readonly heading: Locator;
  private readonly reportTable: Locator;
  private readonly rows: Locator;
  private readonly showingCount: Locator;
  private readonly dateInput: Locator;
  private readonly retrievingInfo: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole('heading', { name: 'Equipment Inspection Report', exact: true });
    this.reportTable = page.getByRole('table');
    this.rows = this.reportTable.locator('tbody tr');
    this.showingCount = page.getByText(/Showing \d+ of \d+ equipment items/i);
    this.dateInput = page.locator('input.flatpickr-input[readonly]').first();
    this.retrievingInfo = page.getByText('Retrieving Info', { exact: true });
  }

  async toBeLoaded(): Promise<void> {
    await expect(this.heading).toBeVisible({ timeout: 30_000 });
    await this.waitForReportData();
  }

  async openReport(): Promise<void> {
    const transientStatuses = new Set([502, 503, 504]);
    let lastStatus: number | undefined;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const response = await this.page.goto('/equipmentreport', { waitUntil: 'domcontentloaded' });
      lastStatus = response?.status();
      if (!lastStatus || !transientStatuses.has(lastStatus)) {
        await this.toBeLoaded();
        await this.selectConfiguredReportDate(process.env.DISPATCH_DATE);
        return;
      }
    }
    throw new Error(`Equipment Report remained unavailable after 3 attempts (HTTP ${lastStatus ?? 'unknown'}).`);
  }

  async getEquipmentReport(): Promise<EquipmentReportArtifact> {
    await this.toBeLoaded();
    const expectedRows = await this.getDisplayedTotal();
    await expect(this.rows).toHaveCount(expectedRows, { timeout: 60_000 });

    const equipment: EquipmentReportRecord[] = [];
    for (let rowIndex = 0; rowIndex < expectedRows; rowIndex += 1) {
      equipment.push(await this.readRow(this.rows.nth(rowIndex)));
    }

    return {
      generatedAt: new Date().toISOString(),
      reportDate: await this.dateInput.inputValue(),
      totalEquipment: await this.readMetric('Total Equipment'),
      inUse: await this.readMetric('In Use'),
      notInUse: await this.readMetric('Not In Use'),
      inspected: await this.readMetric('Inspected'),
      missingInspections: await this.readMetric('Missing Inspections'),
      activeAlerts: await this.readMetric('Active Alerts'),
      extractedCount: equipment.length,
      missingForemanCount: equipment.filter((item) => item.missingForeman).length,
      missingInspectorCount: equipment.filter((item) => item.missingInspector).length,
      equipment,
    };
  }

  private async selectConfiguredReportDate(date: string | undefined): Promise<void> {
    if (!date || (await this.dateInput.inputValue()) === date) return;
    const parsedDate = new Date(`${date}T12:00:00`);
    if (Number.isNaN(parsedDate.getTime())) throw new Error(`Invalid Equipment Report date: ${date}`);

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
    await calendar.locator(`.flatpickr-day[aria-label="${ariaLabel}"]:not(.prevMonthDay):not(.nextMonthDay)`).click();
    await expect(this.dateInput).toHaveValue(date);
    await this.waitForReportData();
    await expect
      .poll(
        async () => {
          const displayedTotal = await this.getDisplayedTotal();
          if (displayedTotal === 0) return true;
          return (await this.rows.first().locator('td').nth(7).textContent())?.trim() === date;
        },
        { message: `Expected Equipment Report rows for ${date}.`, timeout: 60_000 }
      )
      .toBe(true);
  }

  private async waitForReportData(): Promise<void> {
    await expect
      .poll(
        async () => {
          const tableVisible = await this.reportTable.isVisible();
          const countVisible = await this.showingCount.isVisible();
          return tableVisible && countVisible;
        },
        {
          message:
            'Equipment Report did not finish loading: the page remained on "Retrieving Info" and no report table was displayed.',
          timeout: 180_000,
        }
      )
      .toBe(true);
    await expect(this.retrievingInfo).toBeHidden();
  }

  private async getDisplayedTotal(): Promise<number> {
    const text = await this.showingCount.innerText();
    const total = text.match(/Showing\s+\d+\s+of\s+(\d+)\s+equipment items/i)?.[1];
    if (!total) throw new Error(`Equipment report total was not found in: ${text}`);
    return Number(total);
  }

  private async readMetric(label: string): Promise<number> {
    const card = this.page
      .locator('.card-body')
      .filter({ has: this.page.getByText(label, { exact: true }) })
      .first();
    await expect(card).toBeVisible();
    const value = (await card.innerText()).match(/\d+/)?.[0];
    if (!value) throw new Error(`${label} metric was not found.`);
    return Number(value);
  }

  private async readRow(row: Locator): Promise<EquipmentReportRecord> {
    const cells = row.locator('td');
    await expect(cells).toHaveCount(11);
    const values = (await cells.allTextContents()).map((value) => value.trim());
    const inUseLabel = values[5] ?? '';
    const inspectedLabel = values[6] ?? '';
    const foreman = values[1] ?? '';
    const inspector = values[2] ?? '';
    const inspected = /^yes$/i.test(inspectedLabel);
    return {
      jobNumber: values[0] ?? '',
      foreman,
      inspector,
      equipmentNumber: values[3] ?? '',
      description: values[4] ?? '',
      inUseLabel,
      inUse: /key on/i.test(inUseLabel),
      inspectedLabel,
      inspected,
      date: values[7] ?? '',
      pictures: values[8] ?? '',
      status: values[9] ?? '',
      reason: values[10] ?? '',
      missingForeman: this.isMissing(foreman),
      missingInspector: inspected && this.isMissing(inspector),
    };
  }

  private isMissing(value: string): boolean {
    return value.length === 0 || /^(?:—|–|-|вЂ”|n\/a)$/i.test(value.trim());
  }
}
