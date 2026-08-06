import { test } from '@playwright/test';
import { JobNumbersPage } from '@ui/page-objects/job-numbers.page';

test.describe('IBT Hub Job List', () => {
  test('extracts all Job Numbers @smoke @job-numbers', async ({ page }, testInfo) => {
    const jobNumbersPage = new JobNumbersPage(page);
    await jobNumbersPage.open('/jobnumbers');
    const jobNumbers = await jobNumbersPage.getAllJobNumbers();
    await testInfo.attach('job-numbers-report', {
      body: Buffer.from(
        JSON.stringify({
          generatedAt: new Date().toISOString(),
          count: jobNumbers.length,
          jobNumbers,
          message: jobNumbers.length === 0 ? 'No dispatches today' : undefined,
        })
      ),
      contentType: 'application/json',
    });
  });
});
