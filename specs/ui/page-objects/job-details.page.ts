import AdmZip from 'adm-zip';
import { expect, type Locator, type Page } from '@playwright/test';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { BasePage } from './base.page';
import type { ArchivedInspectionRecord, EquipmentRecord, EquipmentSection, JobDispatchDetails } from '@utils/types';

export class JobDetailsPage extends BasePage {
  private readonly heading: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole('heading', { name: 'Job Information', exact: true });
  }

  async toBeLoaded(): Promise<void> {
    await expect(this.heading).toBeVisible({ timeout: 30_000 });
  }

  async openAndGetDispatchDetails(path: string, expectedJobNumber: string): Promise<JobDispatchDetails | null> {
    const jobListHeading = this.page.getByRole('heading', { name: 'Job List', exact: true });

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      await this.page.goto(path, { waitUntil: 'domcontentloaded' });
      await expect(this.heading.or(jobListHeading)).toBeVisible({ timeout: 30_000 });

      if (await this.heading.isVisible()) {
        if (await this.page.getByText('There is no info in this Job Number', { exact: true }).isVisible()) return null;
        return this.getDispatchDetails(expectedJobNumber);
      }
    }

    return null;
  }

  async getDispatchDetails(expectedJobNumber: string): Promise<JobDispatchDetails> {
    await this.toBeLoaded();
    const bodyText = await this.page.locator('body').innerText();
    const jobNumber = this.readText(bodyText, /Job Number:\s*([^\r\n]+)/i, 'Job Number');
    expect(jobNumber).toBe(expectedJobNumber);

    const dispatchedEquipment = this.readNumber(bodyText, /Dispatched Equipment:\s*(\d+)/i, 'Dispatched Equipment');
    const todaysSubmittedInspection = this.readNumber(
      bodyText,
      /Today'?s Submitted Inspection:\s*(\d+)/i,
      "Today's Submitted Inspection"
    );
    if (dispatchedEquipment > 0) {
      await expect
        .poll(() => this.page.locator('table').first().locator('tbody tr').count(), { timeout: 30_000 })
        .toBeGreaterThanOrEqual(dispatchedEquipment);
    }

    const imagesTimedOut = await this.waitForImagesToResolve();
    const sections = await this.readEquipmentSections(imagesTimedOut);
    const dispatchedEquipmentSection = sections.find((section) => section.name === 'All Dispatched Equipment');
    const submittedEquipment = (dispatchedEquipmentSection?.equipment ?? []).filter((equipment) =>
      /^yes$/i.test(equipment.inspectionSubmittedToday)
    );
    const inspectionPdfLinks = submittedEquipment.filter((equipment) => Boolean(equipment.inspectionUrl)).length;
    const archivedInspections =
      todaysSubmittedInspection > inspectionPdfLinks ? await this.readInspectionArchive(todaysSubmittedInspection) : [];

    return {
      jobNumber,
      dataDate: this.readText(bodyText, /Data Date:\s*([^\r\n]+)/i, 'Data Date'),
      dispatchedEquipment,
      todaysSubmittedInspection,
      dispatchedRentalEquipment: this.readNumber(
        bodyText,
        /Dispatched Rental Equipment:\s*(\d+)/i,
        'Dispatched Rental Equipment'
      ),
      dispatchedEquipmentWithOutstandingIssues: this.readNumber(
        bodyText,
        /Dispatched Equipment With Outstanding Issues:\s*(\d+)/i,
        'Dispatched Equipment With Outstanding Issues'
      ),
      submittedInspectionRows: submittedEquipment.length,
      inspectionPdfLinks,
      archivedInspections,
      sections,
    };
  }

  private async readInspectionArchive(expectedCount: number): Promise<ArchivedInspectionRecord[]> {
    if (expectedCount === 0) return [];
    const downloadLink = this.page
      .getByTitle('Download all inspection PDFs as a ZIP')
      .filter({ hasText: String(expectedCount) })
      .first();
    if (!(await downloadLink.isVisible())) return [];

    const [download] = await Promise.all([this.page.waitForEvent('download'), downloadLink.click()]);
    let archiveBuffer: Buffer;
    try {
      const stream = await download.createReadStream();
      if (!stream) throw new Error('Inspection ZIP download stream was not available.');
      const chunks: Buffer[] = [];
      for await (const chunk of stream as AsyncIterable<unknown>) {
        if (typeof chunk === 'string' || chunk instanceof Uint8Array) chunks.push(Buffer.from(chunk));
        else throw new Error('Inspection ZIP returned an unsupported stream chunk.');
      }
      archiveBuffer = Buffer.concat(chunks);
    } finally {
      await download.delete();
    }

    const records: ArchivedInspectionRecord[] = [];
    for (const entry of new AdmZip(archiveBuffer).getEntries()) {
      if (entry.isDirectory || !/\.pdf$/i.test(entry.entryName)) continue;
      const loadingTask = getDocument({ data: new Uint8Array(entry.getData()) });
      const document = await loadingTask.promise;
      const textParts: string[] = [];
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        textParts.push(
          content.items
            .map((item) => ('str' in item && typeof item.str === 'string' ? item.str : ''))
            .filter(Boolean)
            .join('\n')
        );
      }
      await loadingTask.destroy();
      const text = textParts.join('\n');
      const instantNumber = this.readPdfValue(text, /Instant Number:\s*(\d+)/i, entry.entryName);
      const equipmentNumber = this.readPdfValue(text, /Equipment Number\s*:?\s*([^\r\n]+)/i, entry.entryName);
      const inspectedAt = this.readPdfValue(text, /Date\s*:?\s*([^\r\n]+)/i, entry.entryName);
      records.push({
        instantNumber,
        equipmentNumber,
        inspectedAt,
        inspectionTime: inspectedAt.match(/\b\d{1,2}:\d{2}:\d{2}\s*[AP]M\b/i)?.[0] ?? inspectedAt,
        pdfFileName: entry.entryName,
        pdfUrl: `https://d31vcmwunsmzkp.cloudfront.net/inspections/${instantNumber}.pdf`,
      });
    }
    return records;
  }

  private readPdfValue(source: string, pattern: RegExp, fileName: string): string {
    const value = source.match(pattern)?.[1]?.trim();
    if (!value) throw new Error(`Expected inspection value was not found in ${fileName}.`);
    return value;
  }

  private async waitForImagesToResolve(): Promise<boolean> {
    if (process.env.WAIT_FOR_IMAGES === 'false') return false;
    const timeoutMinutes = Number(process.env.IMAGES_TIMEOUT_MINUTES ?? 15);
    const timeout = (Number.isFinite(timeoutMinutes) && timeoutMinutes > 0 ? timeoutMinutes : 15) * 60_000;
    try {
      await expect
        .poll(() => this.page.locator('td .spinner-border').count(), {
          message: 'Expected every Images cell to resolve to View or No images.',
          timeout,
          intervals: [1_000, 2_000, 5_000, 10_000],
        })
        .toBe(0);
      return false;
    } catch {
      return true;
    }
  }

  private async readEquipmentSections(imagesTimedOut: boolean): Promise<EquipmentSection[]> {
    const sectionNames = ['All Dispatched Equipment', 'Extra Inspections', 'Open Issues'];
    const tables = this.page.locator('table');
    const tableCount = await tables.count();
    const sections: EquipmentSection[] = [];

    for (let tableIndex = 0; tableIndex < tableCount; tableIndex += 1) {
      const table = tables.nth(tableIndex);
      const headers = (await table.locator('thead th').allTextContents()).map((header) => header.trim());
      if (!headers.includes('Asset Description')) continue;

      const rows = table.locator('tbody tr');
      const equipment: EquipmentRecord[] = [];
      for (let rowIndex = 0; rowIndex < (await rows.count()); rowIndex += 1) {
        equipment.push(await this.readEquipmentRow(rows.nth(rowIndex), headers, imagesTimedOut));
      }
      sections.push({ name: sectionNames[tableIndex] ?? `Equipment section ${tableIndex + 1}`, equipment });
    }

    return sections;
  }

  private async readEquipmentRow(row: Locator, headers: string[], imagesTimedOut: boolean): Promise<EquipmentRecord> {
    const cells = row.locator('td');
    const values = (await cells.allTextContents()).map((value) => value.trim());
    const valueFor = (header: string): string => {
      const index = headers.indexOf(header);
      return index >= 0 ? (values[index] ?? '') : '';
    };
    const imagesIndex = headers.indexOf('Images');
    const assetIndex = headers.indexOf('Asset Description');
    const assetLink = assetIndex >= 0 ? cells.nth(assetIndex).locator('a').first() : undefined;
    const inspectionHref = assetLink && (await assetLink.count()) > 0 ? await assetLink.getAttribute('href') : null;
    const imagesCell = imagesIndex >= 0 ? cells.nth(imagesIndex) : undefined;
    const imagesText = imagesCell ? (await imagesCell.innerText()).trim() : '';
    const imagesAreLoading = imagesCell ? (await imagesCell.locator('.spinner-border').count()) > 0 : false;
    const imagesLink = imagesCell?.getByRole('link', { name: /^(view|open images)$/i }).first();
    const hasImages =
      !imagesAreLoading &&
      /^(view|open images)$/i.test(imagesText) &&
      Boolean(imagesLink && (await imagesLink.count()));
    const imagesHref = hasImages && imagesLink ? await imagesLink.getAttribute('href') : null;

    return {
      assetDescription: valueFor('Asset Description'),
      inspectionUrl: inspectionHref ? new URL(inspectionHref, this.page.url()).toString() : undefined,
      category: valueFor('Category'),
      status: valueFor('Status'),
      inspectionSubmittedToday: valueFor('Inspection Submitted Today'),
      jobNumber: valueFor('Job #'),
      imagesLabel: imagesAreLoading
        ? imagesTimedOut
          ? 'Loading timeout'
          : 'Not checked - loading'
        : hasImages
          ? 'View'
          : 'No images',
      imagesUrl: imagesHref ? new URL(imagesHref, this.page.url()).toString() : undefined,
    };
  }

  private readText(source: string, pattern: RegExp, label: string): string {
    const value = source.match(pattern)?.[1]?.trim();
    if (!value) throw new Error(`${label} was not found on the Job Information page.`);
    return value;
  }

  private readNumber(source: string, pattern: RegExp, label: string): number {
    return Number(this.readText(source, pattern, label));
  }
}
