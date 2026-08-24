import nodemailer from 'nodemailer';
import type { ArchivedInspectionRecord, InspectionCountValidationArtifact } from '@utils/types';

const comparisonFields: ReadonlyArray<{
  readonly label: string;
  readonly value: (inspection: ArchivedInspectionRecord) => string | undefined;
}> = [
  { label: 'Meter Reading', value: (inspection) => inspection.meterReading },
  { label: 'Inspector Phone', value: (inspection) => inspection.phoneNumber },
  { label: 'Person', value: (inspection) => inspection.phoneOwnerName },
  { label: 'Inspection Date & Time', value: (inspection) => inspection.inspectedAt },
  { label: 'Job Number', value: (inspection) => inspection.jobNumber },
  { label: 'Asset Description', value: (inspection) => inspection.assetDescription },
  { label: 'Operation Status', value: (inspection) => inspection.operationStatus },
];

export async function sendDuplicateInspectionEmail(
  artifact: InspectionCountValidationArtifact | undefined
): Promise<'disabled' | 'no-results' | 'no-duplicates' | 'sent'> {
  if (!process.env.DUPLICATE_EMAIL_TO?.trim()) return 'disabled';
  if (!artifact) return 'no-results';
  const affectedJobs = artifact.jobs.filter((job) => job.duplicateEquipment.length > 0);
  if (affectedJobs.length === 0) return 'no-duplicates';

  const recipients = requiredEnvironment('DUPLICATE_EMAIL_TO')
    .split(',')
    .map((recipient) => recipient.trim())
    .filter(Boolean);
  if (recipients.length === 0) throw new Error('DUPLICATE_EMAIL_TO must contain at least one email address.');

  const emailUser = requiredEnvironment('EMAIL_USER');
  const duplicateCount = affectedJobs.reduce((count, job) => count + job.duplicateEquipment.length, 0);
  const reportDate = process.env.DISPATCH_DATE?.trim() || artifact.generatedAt.slice(0, 10);
  await createTransporter().sendMail({
    from: emailUser,
    to: recipients,
    subject: `[IBT ALERT] Test 6: ${duplicateCount} duplicate inspection${duplicateCount === 1 ? '' : 's'} — ${reportDate}`,
    html: renderEmail(artifact, reportDate),
  });
  return 'sent';
}

export async function sendFullReportEmail(
  reportHtml: string,
  reportDate: string,
  failedTests: number
): Promise<'disabled' | 'sent'> {
  const recipient = process.env.REPORT_EMAIL_TO?.trim();
  if (!recipient) return 'disabled';
  const emailUser = requiredEnvironment('EMAIL_USER');
  const status = failedTests > 0 ? 'FAILED' : 'PASSED';
  await createTransporter().sendMail({
    from: emailUser,
    to: recipient,
    subject: `[IBT ${status}] Complete test report — ${reportDate}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;padding:24px"><h1 style="color:#17334d">IBT Hub Complete Test Report</h1><p>The complete HTML report is attached.</p><p><strong>Report date:</strong> ${escapeHtml(reportDate)}<br><strong>Result:</strong> ${status}<br><strong>Failed tests:</strong> ${failedTests}</p></div>`,
    attachments: [
      {
        filename: `ibt-hub-report-${reportDate}.html`,
        content: reportHtml,
        contentType: 'text/html; charset=utf-8',
      },
    ],
  });
  return 'sent';
}

function createTransporter(): ReturnType<typeof nodemailer.createTransport> {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: requiredEnvironment('EMAIL_USER'), pass: requiredEnvironment('EMAIL_PASSWORD') },
  });
}

function renderEmail(artifact: InspectionCountValidationArtifact, reportDate: string): string {
  const affectedJobs = artifact.jobs.filter((job) => job.duplicateEquipment.length > 0);
  const duplicateCount = affectedJobs.reduce((count, job) => count + job.duplicateEquipment.length, 0);
  const jobs = affectedJobs
    .map(
      (job) =>
        `<section class="job"><h2>Job Number ${escapeHtml(job.jobNumber)}</h2>${job.duplicateEquipment
          .map((duplicate) => {
            const differences = comparisonFields.filter(({ value }) => {
              const values = duplicate.inspections.map((inspection) => normalize(value(inspection)));
              return new Set(values).size > 1;
            });
            const inspectionRows = duplicate.inspections
              .map(
                (inspection, index) =>
                  `<tr><td><strong>Inspection ${index + 1}</strong></td><td>${escapeHtml(inspection.phoneNumber ?? 'Not found')}<small>${inspection.phoneOwnerName ? escapeHtml(inspection.phoneOwnerName) : 'Person not found'}</small></td><td>${escapeHtml(inspection.meterReading ?? 'Not found')}</td><td>${escapeHtml(inspection.inspectedAt)}</td><td><a href="${escapeHtml(inspection.pdfUrl)}">Open PDF</a></td></tr>`
              )
              .join('');
            const differenceRows = differences.length
              ? differences
                  .map(
                    ({ label, value }) =>
                      `<tr class="changed"><th>${escapeHtml(label)}</th>${duplicate.inspections.map((inspection, index) => `<td><small>Inspection ${index + 1}</small>${escapeHtml(value(inspection) ?? 'Not found')}</td>`).join('')}</tr>`
                  )
                  .join('')
              : `<tr><td colspan="${duplicate.inspections.length + 1}">No differences were found in the extracted PDF fields.</td></tr>`;
            return `<article class="duplicate"><div class="critical">${duplicate.hasDifferentPhoneNumbers ? 'CRITICAL · DIFFERENT PHONE NUMBERS' : 'DUPLICATE INSPECTIONS'}</div><h3>Equipment ${escapeHtml(duplicate.equipmentNumber)}</h3><p>${escapeHtml(duplicate.assetDescription)}</p><table><thead><tr><th>Inspection</th><th>Phone / Person</th><th>Meter Reading</th><th>Date &amp; Time</th><th>PDF</th></tr></thead><tbody>${inspectionRows}</tbody></table><h4>Differences found: ${differences.length}</h4><table class="differences"><tbody>${differenceRows}</tbody></table></article>`;
          })
          .join('')}</section>`
    )
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;padding:24px;background:#eef3f7;color:#183047;font-family:Arial,sans-serif}.report{max-width:980px;margin:auto;background:#fff;border-radius:16px;overflow:hidden}.hero{padding:28px 32px;background:linear-gradient(120deg,#0b2439,#76152b);color:#fff}.hero p{margin:7px 0 0;color:#d9e6ef}.summary{padding:15px 32px;background:#fff1c7;color:#6b4c00;font-weight:bold}.job{padding:22px 32px;border-top:1px solid #dce5ec}.job h2{margin:0 0 16px}.duplicate{margin:0 0 20px;padding:18px;border:2px solid #d71935;border-radius:12px;background:#fff8f9}.duplicate h3{margin:12px 0 4px}.duplicate p{margin:0 0 14px;color:#607184}.critical{display:inline-block;padding:6px 10px;border-radius:999px;background:#9d1029;color:#fff;font-size:11px;font-weight:bold}table{width:100%;border-collapse:collapse;background:#fff}th,td{padding:10px;border:1px solid #dce5ec;text-align:left;font-size:13px;vertical-align:top}thead th{background:#18344d;color:#fff}td small{display:block;margin-top:4px;color:#607184}.differences th{width:170px;background:#edf2f6}.differences .changed td{background:#fff1c7;font-weight:bold}.differences td small{margin:0 0 4px;text-transform:uppercase}a{color:#0876e1;font-weight:bold}@media(max-width:700px){body{padding:0}.report{border-radius:0}.hero,.job,.summary{padding-left:16px;padding-right:16px}table{display:block;overflow-x:auto}}</style></head><body><main class="report"><header class="hero"><strong>IBT QUALITY AUTOMATION</strong><h1>Test 6 — Duplicate Inspections</h1><p>Only duplicate inspection findings are included in this notification.</p></header><div class="summary">Report date: ${escapeHtml(reportDate)} · Affected jobs: ${affectedJobs.length} · Duplicate equipment: ${duplicateCount}</div>${jobs}</main></body></html>`;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required when email delivery is configured.`);
  return value;
}

function normalize(value: string | undefined): string {
  return (value?.trim() || 'Not found').toLowerCase();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
