import { promises as fs } from 'node:fs';
import path from 'node:path';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { JobDetailsPage } from '@ui/page-objects/job-details.page';
import { JobNumbersPage } from '@ui/page-objects/job-numbers.page';
import type {
  DispatchDetailsArtifact,
  ImageInspectionValidationArtifact,
  InspectionCountValidationArtifact,
  JobDispatchDetails,
  JobListEntry,
  SkippedJobDispatch,
} from '@utils/types';

const dispatchArtifactPath = path.join(process.cwd(), 'test-results', 'dispatch-details-artifact.json');

function selectRequestedJobs(allJobEntries: JobListEntry[]): JobListEntry[] {
  const requestedJobNumber = process.env.JOB_NUMBER?.trim();
  if (requestedJobNumber) {
    return allJobEntries.filter((entry) => entry.jobNumber === requestedJobNumber);
  }

  const requestedOffset = Number(process.env.JOB_OFFSET ?? 0);
  const offset = Number.isFinite(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0;
  const requestedLimit = Number(process.env.JOB_LIMIT ?? allJobEntries.length);
  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : allJobEntries.length;
  return allJobEntries.slice(offset, offset + limit);
}

async function processJob(
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

async function processJobsConcurrently(
  context: BrowserContext,
  initialPage: Page,
  entries: JobListEntry[],
  jobs: JobDispatchDetails[],
  skippedJobs: SkippedJobDispatch[]
): Promise<void> {
  const configuredWorkers = Number(process.env.IMAGE_PAGE_WORKERS ?? 4);
  const workerCount = Math.min(
    entries.length,
    Number.isFinite(configuredWorkers) && configuredWorkers > 0 ? Math.min(Math.floor(configuredWorkers), 20) : 4
  );
  let nextEntryIndex = 0;
  const pages = [initialPage];
  for (let pageIndex = 1; pageIndex < workerCount; pageIndex += 1) pages.push(await context.newPage());

  await Promise.all(
    pages.map(async (workerPage) => {
      while (nextEntryIndex < entries.length) {
        const entry = entries[nextEntryIndex];
        nextEntryIndex += 1;
        if (entry) await processJob(workerPage, entry, jobs, skippedJobs);
      }
    })
  );

  await Promise.all(pages.slice(1).map((workerPage) => workerPage.close()));
  const entryOrder = new Map(entries.map((entry, index) => [entry.jobNumber, index]));
  jobs.sort((left, right) => (entryOrder.get(left.jobNumber) ?? 0) - (entryOrder.get(right.jobNumber) ?? 0));
  skippedJobs.sort((left, right) => (entryOrder.get(left.jobNumber) ?? 0) - (entryOrder.get(right.jobNumber) ?? 0));
}

async function requireDispatchArtifact(
  artifact: DispatchDetailsArtifact | undefined
): Promise<DispatchDetailsArtifact> {
  if (artifact) return artifact;
  try {
    return JSON.parse(await fs.readFile(dispatchArtifactPath, 'utf8')) as DispatchDetailsArtifact;
  } catch {
    throw new Error('Dispatch details were not extracted before validation.');
  }
}

function createInspectionValidationArtifact(
  dispatchArtifact: DispatchDetailsArtifact
): InspectionCountValidationArtifact {
  const jobs = dispatchArtifact.jobs.map((job) => {
    const dispatchedEquipment =
      job.sections.find((section) => section.name === 'All Dispatched Equipment')?.equipment ?? [];
    const inspectionsByEquipment = new Map<string, typeof job.archivedInspections>();
    for (const inspection of job.archivedInspections) {
      const existing = inspectionsByEquipment.get(inspection.equipmentNumber) ?? [];
      inspectionsByEquipment.set(inspection.equipmentNumber, [...existing, inspection]);
    }
    const duplicateEquipment = [...inspectionsByEquipment.entries()]
      .filter(([, inspections]) => inspections.length > 1)
      .map(([equipmentNumber, inspections]) => ({
        equipmentNumber,
        assetDescription:
          dispatchedEquipment.find((item) => item.assetDescription.startsWith(`${equipmentNumber} `))
            ?.assetDescription ?? equipmentNumber,
        inspections,
      }));
    return {
      jobNumber: job.jobNumber,
      expectedSubmittedInspections: job.todaysSubmittedInspection,
      submittedInspectionRows: job.submittedInspectionRows,
      inspectionPdfLinks: job.inspectionPdfLinks,
      inspectionsWithUploadedImages: dispatchedEquipment.filter(
        (equipment) => /^yes$/i.test(equipment.inspectionSubmittedToday) && equipment.imagesLabel === 'View'
      ).length,
      duplicateEquipment,
      matched:
        job.todaysSubmittedInspection === job.submittedInspectionRows &&
        job.todaysSubmittedInspection === job.inspectionPdfLinks &&
        duplicateEquipment.length === 0,
    };
  });
  return {
    generatedAt: new Date().toISOString(),
    jobCount: jobs.length,
    mismatchCount: jobs.filter((job) => !job.matched).length,
    imagesIncluded: dispatchArtifact.imagesIncluded,
    jobs,
  };
}

function createImageInspectionValidationArtifact(
  dispatchArtifact: DispatchDetailsArtifact
): ImageInspectionValidationArtifact {
  const equipmentWithImageLinks = dispatchArtifact.jobs.flatMap((job) => {
    const equipment = job.sections.find((section) => section.name === 'All Dispatched Equipment')?.equipment ?? [];
    return equipment
      .filter((item): item is typeof item & { readonly imagesUrl: string } => Boolean(item.imagesUrl))
      .map((item) => ({ jobNumber: job.jobNumber, item }));
  });
  const violations = equipmentWithImageLinks
    .filter(({ item }) => !/^yes$/i.test(item.inspectionSubmittedToday.trim()))
    .map(({ jobNumber, item }) => ({
      jobNumber,
      assetDescription: item.assetDescription,
      inspectionSubmittedToday: item.inspectionSubmittedToday,
      imagesUrl: item.imagesUrl,
    }));
  return {
    generatedAt: new Date().toISOString(),
    reportDate: dispatchArtifact.jobs[0]?.dataDate ?? process.env.DISPATCH_DATE ?? 'Not specified',
    checkedImageLinks: equipmentWithImageLinks.length,
    violationCount: violations.length,
    violations,
  };
}

test.describe('IBT Hub dispatch details', () => {
  test.describe.configure({ mode: 'default' });
  let extractedDispatchArtifact: DispatchDetailsArtifact | undefined;

  test('extracts dispatch and equipment details for every Job Number @regression @dispatch-details', async ({
    page,
  }, testInfo) => {
    // This scenario can traverse many jobs and Images may load slowly for each one.
    // Per-page waits remain bounded; the complete scenario must not be interrupted by Playwright's test timeout.
    test.setTimeout(0);
    await fs.rm(dispatchArtifactPath, { force: true });

    const jobNumbersPage = new JobNumbersPage(page);
    await jobNumbersPage.open('/jobnumbers');
    await jobNumbersPage.selectConfiguredDispatchDate(process.env.DISPATCH_DATE);
    const allJobEntries = await jobNumbersPage.getAllJobEntries();
    const jobEntries = selectRequestedJobs(allJobEntries);
    const jobs: JobDispatchDetails[] = [];
    const skippedJobs: SkippedJobDispatch[] = [];

    await processJobsConcurrently(page.context(), page, jobEntries, jobs, skippedJobs);

    const artifact: DispatchDetailsArtifact = {
      generatedAt: new Date().toISOString(),
      jobCount: jobs.length,
      imagesIncluded: process.env.WAIT_FOR_IMAGES !== 'false',
      jobs,
      skippedJobs,
    };
    extractedDispatchArtifact = artifact;
    await fs.mkdir(path.dirname(dispatchArtifactPath), { recursive: true });
    await fs.writeFile(dispatchArtifactPath, JSON.stringify(artifact), 'utf8');
    await testInfo.attach('dispatch-details-report', {
      body: Buffer.from(JSON.stringify(artifact)),
      contentType: 'application/json',
    });
  });

  if (process.env.WAIT_FOR_IMAGES !== 'false') {
    test('requires Inspection Submitted Today Yes for every equipment image link @regression @image-inspection-validation', async ({}, testInfo) => {
      const dispatchArtifact = await requireDispatchArtifact(extractedDispatchArtifact);
      const validationArtifact = createImageInspectionValidationArtifact(dispatchArtifact);
      await testInfo.attach('image-inspection-validation-report', {
        body: Buffer.from(JSON.stringify(validationArtifact)),
        contentType: 'application/json',
      });

      expect(
        validationArtifact.violations,
        `Every equipment image link must belong to a row marked Inspection Submitted Today Yes.`
      ).toEqual([]);
    });
  }

  test('matches submitted inspection totals with Yes rows and Asset Description PDF links @regression @inspection-links', async ({}, testInfo) => {
    const dispatchArtifact = await requireDispatchArtifact(extractedDispatchArtifact);
    const validationArtifact = createInspectionValidationArtifact(dispatchArtifact);
    await testInfo.attach('inspection-count-validation-report', {
      body: Buffer.from(JSON.stringify(validationArtifact)),
      contentType: 'application/json',
    });

    const inspectionCountMismatches = validationArtifact.jobs
      .filter((job) => !job.matched)
      .map(
        (job) =>
          `JN ${job.jobNumber}: summary=${job.expectedSubmittedInspections}, submitted rows=${job.submittedInspectionRows}, PDF links=${job.inspectionPdfLinks}, duplicate equipment=${job.duplicateEquipment.length}`
      );
    expect(
      inspectionCountMismatches,
      `Every submitted inspection must have one "Yes" row and one Asset Description PDF link.\n${inspectionCountMismatches.join('\n')}`
    ).toEqual([]);
  });
});
