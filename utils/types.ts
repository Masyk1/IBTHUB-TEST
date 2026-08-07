export interface JobListEntry {
  readonly jobNumber: string;
  readonly href: string;
}

export interface EquipmentRecord {
  readonly assetDescription: string;
  readonly inspectionUrl?: string;
  readonly category: string;
  readonly status: string;
  readonly inspectionSubmittedToday: string;
  readonly jobNumber: string;
  readonly imagesLabel: string;
  readonly imagesUrl?: string;
}

export interface EquipmentSection {
  readonly name: string;
  readonly equipment: EquipmentRecord[];
}

export interface JobDispatchDetails {
  readonly jobNumber: string;
  readonly dataDate: string;
  readonly dispatchedEquipment: number;
  readonly todaysSubmittedInspection: number;
  readonly dispatchedRentalEquipment: number;
  readonly dispatchedEquipmentWithOutstandingIssues: number;
  readonly submittedInspectionRows: number;
  readonly inspectionPdfLinks: number;
  readonly archivedInspections: ArchivedInspectionRecord[];
  readonly sections: EquipmentSection[];
}

export interface ArchivedInspectionRecord {
  readonly instantNumber: string;
  readonly equipmentNumber: string;
  readonly inspectedAt: string;
  readonly inspectionTime: string;
  readonly pdfFileName: string;
  readonly pdfUrl: string;
}

export interface DispatchDetailsArtifact {
  readonly generatedAt: string;
  readonly jobCount: number;
  readonly imagesIncluded: boolean;
  readonly jobs: JobDispatchDetails[];
  readonly skippedJobs: SkippedJobDispatch[];
}

export interface SkippedJobDispatch {
  readonly jobNumber: string;
  readonly reason: string;
  readonly pageUrl: string;
  readonly screenshotBase64: string;
}

export interface InspectionCountValidationItem {
  readonly jobNumber: string;
  readonly expectedSubmittedInspections: number;
  readonly submittedInspectionRows: number;
  readonly inspectionPdfLinks: number;
  readonly inspectionsWithUploadedImages: number;
  readonly duplicateEquipment: DuplicateEquipmentInspection[];
  readonly matched: boolean;
}

export interface DuplicateEquipmentInspection {
  readonly equipmentNumber: string;
  readonly assetDescription: string;
  readonly inspections: ArchivedInspectionRecord[];
}

export interface InspectionCountValidationArtifact {
  readonly generatedAt: string;
  readonly jobCount: number;
  readonly mismatchCount: number;
  readonly imagesIncluded: boolean;
  readonly jobs: InspectionCountValidationItem[];
}

export interface ImageInspectionViolation {
  readonly jobNumber: string;
  readonly assetDescription: string;
  readonly inspectionSubmittedToday: string;
  readonly imagesUrl: string;
}

export interface ImageInspectionValidationArtifact {
  readonly generatedAt: string;
  readonly reportDate: string;
  readonly checkedImageLinks: number;
  readonly violationCount: number;
  readonly violations: ImageInspectionViolation[];
}

export interface EquipmentReportRecord {
  readonly jobNumber: string;
  readonly foreman: string;
  readonly inspector: string;
  readonly equipmentNumber: string;
  readonly description: string;
  readonly inUseLabel: string;
  readonly inUse: boolean;
  readonly inspectedLabel: string;
  readonly inspected: boolean;
  readonly date: string;
  readonly pictures: string;
  readonly status: string;
  readonly reason: string;
  readonly missingForeman: boolean;
  readonly missingInspector: boolean;
}

export interface EquipmentReportArtifact {
  readonly generatedAt: string;
  readonly reportDate: string;
  readonly totalEquipment: number;
  readonly inUse: number;
  readonly notInUse: number;
  readonly inspected: number;
  readonly missingInspections: number;
  readonly activeAlerts: number;
  readonly extractedCount: number;
  readonly missingForemanCount: number;
  readonly missingInspectorCount: number;
  readonly equipment: EquipmentReportRecord[];
}

export interface InspectorValidationArtifact {
  readonly generatedAt: string;
  readonly reportDate: string;
  readonly inspectedCount: number;
  readonly missingInspectorCount: number;
  readonly missingForemanCount: number;
  readonly inspections: EquipmentReportRecord[];
}
