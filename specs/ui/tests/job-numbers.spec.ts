import { promises as fs } from 'node:fs';
import path from 'node:path';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { EquipmentReportPage } from '@ui/page-objects/equipment-report.page';
import { JobDetailsPage } from '@ui/page-objects/job-details.page';
import { JobNumbersPage } from '@ui/page-objects/job-numbers.page';
import {
  createImageInspectionValidationArtifact,
  createInspectionValidationArtifact,
} from '@utils/dispatch-validations';
import { validateEquipmentExcel } from '@utils/equipment-excel-validation';
import type {
  DispatchDetailsArtifact,
  EquipmentRecord,
  EquipmentImageInspectionConflict,
  JobDispatchDetails,
  JobEquipmentFieldMismatch,
  JobEquipmentSnapshot,
  JobEquipmentValidationArtifact,
  JobListEntry,
  SkippedJobDispatch,
} from '@utils/types';

const dispatchArtifactPath = path.join(process.cwd(), 'test-results', 'dispatch-details-artifact.json');

function normalizeEquipmentNumber(value: string): string {
  const normalized = value.trim().toUpperCase();
  return /^\d+$/.test(normalized) ? normalized.replace(/^0+(?=\d)/, '') : normalized;
}

function equipmentNumberFromAssetDescription(assetDescription: string): string {
  return assetDescription.trim().split(/\s+/, 1)[0] ?? '';
}

function equipmentNumbersMatch(reportNumber: string, assetDescription: string): boolean {
  const normalizedReportNumber = normalizeEquipmentNumber(reportNumber);
  const assetNumber = equipmentNumberFromAssetDescription(assetDescription);
  const normalizedAssetNumber = normalizeEquipmentNumber(assetNumber.split('-', 1)[0] ?? assetNumber);
  if (normalizedReportNumber === normalizedAssetNumber) return true;

  const prefixedReportNumber = /^[A-Z0-9]+-(\d+)$/.exec(normalizedReportNumber)?.[1];
  return prefixedReportNumber !== undefined && normalizeEquipmentNumber(prefixedReportNumber) === normalizedAssetNumber;
}

function yesNo(value: boolean): string {
  return value ? 'Yes' : 'No';
}

const excelColumnByComparedField: Readonly<
  Record<JobEquipmentFieldMismatch['field'], 'description' | 'inspectedLabel' | 'pictures' | 'date'>
> = {
  Description: 'description',
  Inspected: 'inspectedLabel',
  Pictures: 'pictures',
  Date: 'date',
};

function findSnapshotEquipment(
  snapshot: JobEquipmentSnapshot,
  equipmentNumber: string,
  description?: string
): EquipmentRecord | undefined {
  return (
    snapshot.equipment.find((item) => equipmentNumbersMatch(equipmentNumber, item.assetDescription)) ??
    (description
      ? snapshot.equipment.find((item) => item.category.trim().toUpperCase() === description.trim().toUpperCase())
      : undefined)
  );
}

function snapshotFieldValue(
  snapshot: JobEquipmentSnapshot,
  equipment: EquipmentRecord,
  field: JobEquipmentFieldMismatch['field']
): string {
  if (field === 'Description') return equipment.category;
  if (field === 'Inspected') return yesNo(/^yes$/i.test(equipment.inspectionSubmittedToday));
  if (field === 'Pictures') {
    if (equipment.imagesLabel === 'Not checked - loading' || equipment.imagesLabel === 'Loading timeout') {
      return equipment.imagesLabel;
    }
    return yesNo(Boolean(equipment.imagesUrl));
  }
  return snapshot.dataDate;
}

async function requireDispatchArtifact(
  artifact: DispatchDetailsArtifact | undefined
): Promise<DispatchDetailsArtifact> {
  if (artifact) return artifact;
  try {
    return JSON.parse(await fs.readFile(dispatchArtifactPath, 'utf8')) as DispatchDetailsArtifact;
  } catch {
    throw new Error('Job Details must be extracted before the dependent validations.');
  }
}

async function extractJobDetails(
  page: Page,
  entry: JobListEntry,
  jobs: JobDispatchDetails[],
  skippedJobs: SkippedJobDispatch[]
): Promise<void> {
  const jobDetailsPage = new JobDetailsPage(page);
  try {
    const details = await jobDetailsPage.openAndGetDispatchDetails(entry.href, entry.jobNumber);
    if (details) {
      jobs.push(details);
      return;
    }

    skippedJobs.push({
      jobNumber: entry.jobNumber,
      reason: 'Job Information was not displayed after two navigation attempts.',
      pageUrl: page.url(),
      screenshotBase64: (await page.screenshot({ fullPage: true })).toString('base64'),
    });
  } catch (error) {
    skippedJobs.push({
      jobNumber: entry.jobNumber,
      reason: error instanceof Error ? error.message : String(error),
      pageUrl: page.url(),
      screenshotBase64: (await page.screenshot({ fullPage: true })).toString('base64'),
    });
  }
}

async function extractAllJobDetails(
  context: BrowserContext,
  initialPage: Page,
  entries: JobListEntry[]
): Promise<{ jobs: JobDispatchDetails[]; skippedJobs: SkippedJobDispatch[] }> {
  const jobs: JobDispatchDetails[] = [];
  const skippedJobs: SkippedJobDispatch[] = [];
  const configuredWorkers = Number(process.env.JOB_LIST_PAGE_WORKERS ?? 8);
  const workerCount = Math.min(
    entries.length,
    Number.isFinite(configuredWorkers) && configuredWorkers > 0 ? Math.min(Math.floor(configuredWorkers), 15) : 8
  );
  let nextEntryIndex = 0;
  const pages = [initialPage];
  for (let pageIndex = 1; pageIndex < workerCount; pageIndex += 1) pages.push(await context.newPage());

  await Promise.all(
    pages.map(async (workerPage) => {
      while (nextEntryIndex < entries.length) {
        const entry = entries[nextEntryIndex];
        nextEntryIndex += 1;
        if (entry) await extractJobDetails(workerPage, entry, jobs, skippedJobs);
      }
    })
  );

  await Promise.all(pages.slice(1).map((workerPage) => workerPage.close()));
  const entryOrder = new Map(entries.map((entry, index) => [entry.jobNumber, index]));
  jobs.sort((left, right) => (entryOrder.get(left.jobNumber) ?? 0) - (entryOrder.get(right.jobNumber) ?? 0));
  skippedJobs.sort((left, right) => (entryOrder.get(left.jobNumber) ?? 0) - (entryOrder.get(right.jobNumber) ?? 0));
  return { jobs, skippedJobs };
}

test.describe('IBT Hub Job List', () => {
  test.describe.configure({ mode: 'default' });
  let extractedDispatchArtifact: DispatchDetailsArtifact | undefined;

  test('extracts all Job Numbers @smoke @job-numbers', async ({ page }, testInfo) => {
    test.setTimeout(0);
    await fs.rm(dispatchArtifactPath, { force: true });
    const jobNumbersPage = new JobNumbersPage(page);
    await jobNumbersPage.open('/jobnumbers');
    await jobNumbersPage.selectConfiguredDispatchDate(process.env.DISPATCH_DATE);
    const entries = await jobNumbersPage.getAllJobEntries();
    const { jobs, skippedJobs } = await extractAllJobDetails(page.context(), page, entries);
    const jobNumbers = entries.map((entry) => entry.jobNumber);
    const dispatchArtifact: DispatchDetailsArtifact = {
      generatedAt: new Date().toISOString(),
      jobCount: jobs.length,
      imagesIncluded: process.env.WAIT_FOR_IMAGES !== 'false',
      jobs,
      skippedJobs,
    };
    extractedDispatchArtifact = dispatchArtifact;
    await fs.mkdir(path.dirname(dispatchArtifactPath), { recursive: true });
    await fs.writeFile(dispatchArtifactPath, JSON.stringify(dispatchArtifact), 'utf8');
    await testInfo.attach('dispatch-details-report', {
      body: Buffer.from(JSON.stringify(dispatchArtifact)),
      contentType: 'application/json',
    });

    await testInfo.attach('job-numbers-report', {
      body: Buffer.from(
        JSON.stringify({
          generatedAt: new Date().toISOString(),
          count: jobNumbers.length,
          jobNumbers,
          jobs,
          skippedJobs,
          imagesIncluded: process.env.WAIT_FOR_IMAGES !== 'false',
          message: jobNumbers.length === 0 ? 'No dispatches today' : undefined,
        })
      ),
      contentType: 'application/json',
    });
  });

  if (process.env.WAIT_FOR_IMAGES !== 'false') {
    test('validates image links against submitted inspections @regression @image-inspection-validation', async ({}, testInfo) => {
      const dispatchArtifact = await requireDispatchArtifact(extractedDispatchArtifact);
      const imageValidation = createImageInspectionValidationArtifact(dispatchArtifact);
      await testInfo.attach('image-inspection-validation-report', {
        body: Buffer.from(JSON.stringify(imageValidation)),
        contentType: 'application/json',
      });

      expect(
        imageValidation.violations,
        'Every equipment image link must belong to a row marked Inspection Submitted Today Yes.'
      ).toEqual([]);
    });
  }

  test('validates submitted inspection totals and PDF links @regression @inspection-links', async ({}, testInfo) => {
    const dispatchArtifact = await requireDispatchArtifact(extractedDispatchArtifact);
    const inspectionValidation = createInspectionValidationArtifact(dispatchArtifact);
    await testInfo.attach('inspection-count-validation-report', {
      body: Buffer.from(JSON.stringify(inspectionValidation)),
      contentType: 'application/json',
    });

    expect(
      inspectionValidation.jobs.filter((job) => !job.matched),
      'Every submitted inspection must have one Yes row, one PDF link and no duplicate equipment inspection.'
    ).toEqual([]);
  });

  test('Excel Equipment Report - validates downloaded Excel against UI and Job Number pages @regression @excel-equipment-validation', async ({
    page,
  }, testInfo) => {
    test.setTimeout(600_000);
    const dispatchArtifact = await requireDispatchArtifact(extractedDispatchArtifact);
    const jobs = dispatchArtifact.jobs;
    const equipmentReportPage = new EquipmentReportPage(page);
    await equipmentReportPage.openReport();
    const equipmentReport = await equipmentReportPage.getEquipmentReport();
    const excelDownload = await equipmentReportPage.downloadExcel();
    const excelValidation = await validateEquipmentExcel(
      excelDownload.buffer,
      equipmentReport.equipment,
      excelDownload.fileName
    );
    const availableEquipmentByJob = new Map(
      jobs.map((job) => [
        job.jobNumber,
        job.sections.find((section) => section.name === 'All Dispatched Equipment')?.equipment ?? [],
      ])
    );
    const jobDateByNumber = new Map(jobs.map((job) => [job.jobNumber, job.dataDate]));
    const mismatches: JobEquipmentFieldMismatch[] = [];
    const imageWithoutInspection: EquipmentImageInspectionConflict[] = [];
    const missingEquipment = equipmentReport.equipment.flatMap((equipment, equipmentIndex) => {
      const availableEquipment = availableEquipmentByJob.get(equipment.jobNumber) ?? [];
      let matchedIndex = availableEquipment.findIndex((item) =>
        equipmentNumbersMatch(equipment.equipmentNumber, item.assetDescription)
      );
      if (matchedIndex < 0) {
        matchedIndex = availableEquipment.findIndex(
          (item) => item.category.trim().toUpperCase() === equipment.description.trim().toUpperCase()
        );
      }
      if (matchedIndex >= 0) {
        const matchedEquipment = availableEquipment.splice(matchedIndex, 1)[0];
        const excelInspected =
          excelValidation.mismatches.find((item) => item.row === equipmentIndex + 1 && item.column === 'inspectedLabel')
            ?.excelValue ?? equipment.inspectedLabel;
        const excelPictures =
          excelValidation.mismatches.find((item) => item.row === equipmentIndex + 1 && item.column === 'pictures')
            ?.excelValue ?? equipment.pictures;
        const allDispatchedInspected = yesNo(/^yes$/i.test(matchedEquipment.inspectionSubmittedToday));
        const allDispatchedPictures =
          matchedEquipment.imagesLabel === 'Not checked - loading' || matchedEquipment.imagesLabel === 'Loading timeout'
            ? matchedEquipment.imagesLabel
            : yesNo(Boolean(matchedEquipment.imagesUrl));
        const sources = [
          { inspected: excelInspected, pictures: excelPictures },
          { inspected: equipment.inspectedLabel, pictures: equipment.pictures },
          { inspected: allDispatchedInspected, pictures: allDispatchedPictures },
        ];
        if (sources.some((source) => /^no$/i.test(source.inspected) && /^yes$/i.test(source.pictures))) {
          imageWithoutInspection.push({
            jobNumber: equipment.jobNumber,
            equipmentNumber: equipment.equipmentNumber,
            excelInspected,
            excelPictures,
            equipmentReportInspected: equipment.inspectedLabel,
            equipmentReportPictures: equipment.pictures,
            allDispatchedInspected,
            allDispatchedPictures,
          });
        }
        const comparisons: ReadonlyArray<{
          field: JobEquipmentFieldMismatch['field'];
          reportValue: string;
          jobValue: string;
        }> = [
          {
            field: 'Description',
            reportValue: equipment.description,
            jobValue: matchedEquipment.category,
          },
          {
            field: 'Inspected',
            reportValue: yesNo(equipment.inspected),
            jobValue: yesNo(/^yes$/i.test(matchedEquipment.inspectionSubmittedToday)),
          },
          {
            field: 'Pictures',
            reportValue: yesNo(/^yes$/i.test(equipment.pictures)),
            jobValue:
              matchedEquipment.imagesLabel === 'Not checked - loading' ||
              matchedEquipment.imagesLabel === 'Loading timeout'
                ? matchedEquipment.imagesLabel
                : yesNo(Boolean(matchedEquipment.imagesUrl)),
          },
          {
            field: 'Date',
            reportValue: equipment.date,
            jobValue: jobDateByNumber.get(equipment.jobNumber) ?? '',
          },
        ];
        for (const comparison of comparisons) {
          const excelValue =
            excelValidation.mismatches.find(
              (item) => item.row === equipmentIndex + 1 && item.column === excelColumnByComparedField[comparison.field]
            )?.excelValue ?? comparison.reportValue;
          const normalizedValues = [excelValue, comparison.reportValue, comparison.jobValue].map((value) =>
            value.trim().toUpperCase()
          );
          if (new Set(normalizedValues).size > 1) {
            mismatches.push({
              jobNumber: equipment.jobNumber,
              equipmentNumber: equipment.equipmentNumber,
              field: comparison.field,
              excelValue,
              equipmentReportValue: comparison.reportValue,
              jobDetailsValue: comparison.jobValue,
              excelInspected,
              excelPictures,
              equipmentReportInspected: equipment.inspectedLabel,
              equipmentReportPictures: equipment.pictures,
              allDispatchedInspected,
              allDispatchedPictures,
            });
          }
        }
        return [];
      }
      return [
        {
          jobNumber: equipment.jobNumber,
          equipmentNumber: equipment.equipmentNumber,
          description: equipment.description,
        },
      ];
    });
    let equipmentValidation: JobEquipmentValidationArtifact = {
      generatedAt: new Date().toISOString(),
      reportRowCount: equipmentReport.equipment.length,
      extractedJobCount: jobs.length,
      missingCount: missingEquipment.length,
      missingEquipment,
      mismatchCount: mismatches.length,
      mismatches,
      imageWithoutInspectionCount: imageWithoutInspection.length,
      imageWithoutInspection,
    };
    // A live report can change while all Job pages are being traversed; recheck only initial differences.
    // eslint-disable-next-line playwright/no-conditional-in-test
    if (equipmentValidation.missingCount > 0 || equipmentValidation.mismatchCount > 0) {
      const affectedJobNumbers = new Set([
        ...equipmentValidation.missingEquipment.map((item) => item.jobNumber),
        ...equipmentValidation.mismatches.map((item) => item.jobNumber),
      ]);
      const jobNumbersPage = new JobNumbersPage(page);
      await jobNumbersPage.open('/jobnumbers');
      await jobNumbersPage.selectConfiguredDispatchDate(process.env.DISPATCH_DATE);
      const entriesByJobNumber = new Map(
        (await jobNumbersPage.getAllJobEntries()).map((entry) => [entry.jobNumber, entry])
      );
      const snapshots = new Map<string, JobEquipmentSnapshot>();
      const snapshotPage = new JobDetailsPage(page);
      for (const jobNumber of affectedJobNumbers) {
        const entry = entriesByJobNumber.get(jobNumber);
        // eslint-disable-next-line playwright/no-conditional-in-test
        if (!entry) continue;
        const snapshot = await snapshotPage.openAndGetEquipmentSnapshot(entry.href, jobNumber);
        // eslint-disable-next-line playwright/no-conditional-in-test
        if (snapshot) snapshots.set(jobNumber, snapshot);
      }

      const refreshedMissingEquipment = equipmentValidation.missingEquipment.filter((item) => {
        const snapshot = snapshots.get(item.jobNumber);
        return !snapshot || !findSnapshotEquipment(snapshot, item.equipmentNumber, item.description);
      });
      const refreshedMismatches = equipmentValidation.mismatches.flatMap((item) => {
        const snapshot = snapshots.get(item.jobNumber);
        if (!snapshot) return [item];
        const equipment = findSnapshotEquipment(snapshot, item.equipmentNumber);
        if (!equipment) return [item];
        const refreshedValue = snapshotFieldValue(snapshot, equipment, item.field);
        const valuesDiffer =
          new Set(
            [item.excelValue, item.equipmentReportValue, refreshedValue].map((value) => value.trim().toUpperCase())
          ).size > 1;
        if (!valuesDiffer) return [];
        const allDispatchedInspected = yesNo(/^yes$/i.test(equipment.inspectionSubmittedToday));
        const allDispatchedPictures =
          equipment.imagesLabel === 'Not checked - loading' || equipment.imagesLabel === 'Loading timeout'
            ? equipment.imagesLabel
            : yesNo(Boolean(equipment.imagesUrl));
        return [
          {
            ...item,
            jobDetailsValue: refreshedValue,
            allDispatchedInspected,
            allDispatchedPictures,
          },
        ];
      });
      equipmentValidation = {
        ...equipmentValidation,
        missingCount: refreshedMissingEquipment.length,
        missingEquipment: refreshedMissingEquipment,
        mismatchCount: refreshedMismatches.length,
        mismatches: refreshedMismatches,
      };
    }
    await testInfo.attach('excel-equipment-validation-report', {
      body: Buffer.from(
        JSON.stringify({
          generatedAt: new Date().toISOString(),
          reportDate: equipmentReport.reportDate,
          rowCount: equipmentReport.equipment.length,
          excelValidation,
          jobValidation: equipmentValidation,
        })
      ),
      contentType: 'application/json',
    });

    expect(
      excelValidation.mismatches,
      'Every Equipment Report Excel value must be identical to the corresponding UI value.'
    ).toEqual([]);
    expect(excelValidation.excelRowCount, 'Excel and Equipment Report UI must contain the same row count.').toBe(
      excelValidation.uiRowCount
    );
    expect(
      equipmentValidation.missingEquipment,
      'Every Job Number and Equipment pair from Eq Report must exist in All Dispatched Equipment.'
    ).toEqual([]);
    expect(
      equipmentValidation.mismatches,
      'Description, Inspected, Pictures and Date must match between Eq Report and All Dispatched Equipment.'
    ).toEqual([]);
    expect(
      equipmentValidation.imageWithoutInspection,
      'Pictures must not be Yes when Inspected is No in Excel, Equipment Report UI, or All Dispatched Equipment.'
    ).toEqual([]);
  });
});
