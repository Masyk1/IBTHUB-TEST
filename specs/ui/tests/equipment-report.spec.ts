import { expect, test } from '@playwright/test';
import { EquipmentReportPage } from '@ui/page-objects/equipment-report.page';

test.describe('IBT Hub Equipment Inspection Report', () => {
  test('extracts all equipment and reports equipment without a Foreman @regression @equipment-report', async ({
    page,
  }, testInfo) => {
    test.setTimeout(300_000);
    const equipmentReportPage = new EquipmentReportPage(page);
    await equipmentReportPage.openReport();
    const artifact = await equipmentReportPage.getEquipmentReport();

    await testInfo.attach('equipment-report', {
      body: Buffer.from(JSON.stringify(artifact)),
      contentType: 'application/json',
    });
  });

  test('reports inspected equipment without an Inspector or Foreman @regression @inspector-validation', async ({
    page,
  }, testInfo) => {
    test.setTimeout(300_000);
    const equipmentReportPage = new EquipmentReportPage(page);
    await equipmentReportPage.openReport();
    const equipmentReport = await equipmentReportPage.getEquipmentReport();
    const inspectedEquipment = equipmentReport.equipment.filter((item) => item.inspected);
    const inspectionsWithoutInspector = inspectedEquipment.filter((item) => item.missingInspector);
    const inspectionsWithoutForeman = inspectedEquipment.filter((item) => item.missingForeman);
    const personnelFindings = inspectedEquipment.filter((item) => item.missingInspector || item.missingForeman);

    await testInfo.attach('inspector-validation-report', {
      body: Buffer.from(
        JSON.stringify({
          generatedAt: new Date().toISOString(),
          reportDate: equipmentReport.reportDate,
          inspectedCount: inspectedEquipment.length,
          missingInspectorCount: inspectionsWithoutInspector.length,
          missingForemanCount: inspectionsWithoutForeman.length,
          inspections: personnelFindings,
        })
      ),
      contentType: 'application/json',
    });

    expect(inspectionsWithoutInspector, 'Every equipment item marked Inspected Yes must have an Inspector.').toEqual(
      []
    );
  });
});
