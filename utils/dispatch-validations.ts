import type {
  DispatchDetailsArtifact,
  ImageInspectionValidationArtifact,
  InspectionCountValidationArtifact,
} from '@utils/types';

export function createInspectionValidationArtifact(
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
      .map(([equipmentNumber, inspections]) => {
        const phonesByNormalizedValue = new Map<string, string>();
        for (const inspection of inspections) {
          const phoneNumber = inspection.phoneNumber?.trim();
          const normalizedPhoneNumber = phoneNumber?.replace(/\D/g, '') ?? '';
          if (phoneNumber && normalizedPhoneNumber.length >= 7) {
            phonesByNormalizedValue.set(normalizedPhoneNumber, phoneNumber);
          }
        }
        const phoneNumbers = [...phonesByNormalizedValue.values()];
        return {
          equipmentNumber,
          assetDescription:
            dispatchedEquipment.find((item) => item.assetDescription.startsWith(`${equipmentNumber} `))
              ?.assetDescription ?? equipmentNumber,
          phoneNumbers,
          hasDifferentPhoneNumbers: phoneNumbers.length > 1,
          inspections,
        };
      });
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

export function createImageInspectionValidationArtifact(
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
