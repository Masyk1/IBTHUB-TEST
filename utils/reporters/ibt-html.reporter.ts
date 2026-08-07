import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import type {
  DispatchDetailsArtifact,
  EquipmentRecord,
  EquipmentReportArtifact,
  ImageInspectionValidationArtifact,
  InspectionCountValidationArtifact,
  InspectorValidationArtifact,
  JobDispatchDetails,
} from '@utils/types';

interface JobNumbersArtifact {
  readonly count: number;
  readonly jobNumbers: string[];
  readonly message?: string;
}

interface ReportEntry {
  readonly title: string;
  readonly status: TestResult['status'];
  readonly duration: number;
  readonly error?: string;
  readonly jobNumbers?: JobNumbersArtifact;
  readonly dispatchDetails?: DispatchDetailsArtifact;
  readonly inspectionValidation?: InspectionCountValidationArtifact;
  readonly imageInspectionValidation?: ImageInspectionValidationArtifact;
  readonly equipmentReport?: EquipmentReportArtifact;
  readonly inspectorValidation?: InspectorValidationArtifact;
}

class IbtHtmlReporter implements Reporter {
  private readonly entries: ReportEntry[] = [];
  private readonly outputFile = path.join(process.cwd(), 'artifacts', 'local', 'ibt-hub-report.html');

  // Reporter hooks support promises; this override is required to read attachment files.
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  async onTestEnd(test: TestCase, result: TestResult): Promise<void> {
    const attachment = result.attachments.find((item) => item.name === 'job-numbers-report');
    const dispatchAttachment = result.attachments.find((item) => item.name === 'dispatch-details-report');
    const inspectionValidationAttachment = result.attachments.find(
      (item) => item.name === 'inspection-count-validation-report'
    );
    const imageInspectionValidationAttachment = result.attachments.find(
      (item) => item.name === 'image-inspection-validation-report'
    );
    const equipmentReportAttachment = result.attachments.find((item) => item.name === 'equipment-report');
    const inspectorValidationAttachment = result.attachments.find(
      (item) => item.name === 'inspector-validation-report'
    );
    let jobNumbers: JobNumbersArtifact | undefined;
    let dispatchDetails: DispatchDetailsArtifact | undefined;
    let inspectionValidation: InspectionCountValidationArtifact | undefined;
    let imageInspectionValidation: ImageInspectionValidationArtifact | undefined;
    let equipmentReport: EquipmentReportArtifact | undefined;
    let inspectorValidation: InspectorValidationArtifact | undefined;

    try {
      const json =
        attachment?.body?.toString('utf8') ??
        (attachment?.path ? await fs.readFile(attachment.path, 'utf8') : undefined);
      jobNumbers = json ? (JSON.parse(json) as JobNumbersArtifact) : undefined;
    } catch {
      jobNumbers = undefined;
    }

    try {
      const json =
        dispatchAttachment?.body?.toString('utf8') ??
        (dispatchAttachment?.path ? await fs.readFile(dispatchAttachment.path, 'utf8') : undefined);
      dispatchDetails = json ? (JSON.parse(json) as DispatchDetailsArtifact) : undefined;
    } catch {
      dispatchDetails = undefined;
    }

    try {
      const json =
        inspectionValidationAttachment?.body?.toString('utf8') ??
        (inspectionValidationAttachment?.path
          ? await fs.readFile(inspectionValidationAttachment.path, 'utf8')
          : undefined);
      inspectionValidation = json ? (JSON.parse(json) as InspectionCountValidationArtifact) : undefined;
    } catch {
      inspectionValidation = undefined;
    }

    try {
      const json =
        imageInspectionValidationAttachment?.body?.toString('utf8') ??
        (imageInspectionValidationAttachment?.path
          ? await fs.readFile(imageInspectionValidationAttachment.path, 'utf8')
          : undefined);
      imageInspectionValidation = json ? (JSON.parse(json) as ImageInspectionValidationArtifact) : undefined;
    } catch {
      imageInspectionValidation = undefined;
    }

    try {
      const json =
        equipmentReportAttachment?.body?.toString('utf8') ??
        (equipmentReportAttachment?.path ? await fs.readFile(equipmentReportAttachment.path, 'utf8') : undefined);
      equipmentReport = json ? (JSON.parse(json) as EquipmentReportArtifact) : undefined;
    } catch {
      equipmentReport = undefined;
    }

    try {
      const json =
        inspectorValidationAttachment?.body?.toString('utf8') ??
        (inspectorValidationAttachment?.path
          ? await fs.readFile(inspectorValidationAttachment.path, 'utf8')
          : undefined);
      inspectorValidation = json ? (JSON.parse(json) as InspectorValidationArtifact) : undefined;
    } catch {
      inspectorValidation = undefined;
    }

    this.entries.push({
      title: test.title,
      status: result.status,
      duration: result.duration,
      error: result.error?.message,
      jobNumbers,
      dispatchDetails,
      inspectionValidation,
      imageInspectionValidation,
      equipmentReport,
      inspectorValidation,
    });
  }

  async onEnd(): Promise<void> {
    await fs.mkdir(path.dirname(this.outputFile), { recursive: true });
    await fs.writeFile(this.outputFile, this.render(), 'utf8');
    console.log(`\nIBT Hub HTML report: ${this.outputFile}`);
  }

  private render(): string {
    const functionalEntries = this.entries.filter((entry) => !this.isSetupEntry(entry));
    const passed = functionalEntries.filter((entry) => entry.status === 'passed').length;
    const failed = functionalEntries.length - passed;
    const setupEntry = this.entries.find((entry) => this.isSetupEntry(entry));
    const reportDate =
      process.env.DISPATCH_DATE ??
      functionalEntries.find((entry) => entry.equipmentReport)?.equipmentReport?.reportDate ??
      functionalEntries.find((entry) => entry.inspectorValidation)?.inspectorValidation?.reportDate ??
      functionalEntries.find((entry) => entry.dispatchDetails)?.dispatchDetails?.jobs[0]?.dataDate ??
      'Not specified';
    const generatedAt = new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date());
    let testNumber = 0;
    const testCards = this.entries
      .map((entry) => this.renderEntry(entry, this.isSetupEntry(entry) ? undefined : ++testNumber))
      .join('');
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>IBT Hub Automation Report</title><style>
*{box-sizing:border-box}body{margin:0;background:linear-gradient(135deg,#eef2f6 0%,#f8fafc 55%,#f3e8eb 100%);color:#172638;font-family:Segoe UI,Arial,sans-serif}.wrap{max-width:1180px;margin:32px auto;background:#fff;border:1px solid #dce3e9;border-radius:18px;box-shadow:0 22px 60px #19324d24;overflow:hidden}
header{padding:38px 42px 34px;background:linear-gradient(115deg,#182b3e 0%,#263f57 68%,#8d172d 100%);color:#fff;position:relative}header:after{content:"";position:absolute;right:38px;bottom:0;width:180px;height:5px;background:#ef3340;border-radius:5px 5px 0 0}header h1{margin:4px 0 8px;font-size:32px;letter-spacing:-.5px}.eyebrow{margin:0;color:#ff9ca6;font-size:12px;font-weight:800;letter-spacing:1.8px;text-transform:uppercase}.header-row{display:flex;justify-content:space-between;align-items:flex-end;gap:20px}.header-copy{margin:0;color:#dce5ed}.setup-status{padding:8px 13px;border:1px solid #ffffff42;border-radius:999px;background:#ffffff13;font-size:12px;font-weight:700;white-space:nowrap}.summary{display:grid;grid-template-columns:repeat(3,minmax(150px,1fr));gap:16px;padding:24px 36px;background:#f7f9fb;border-bottom:1px solid #e2e7eb}
.metric{padding:18px 20px;background:#fff;border-radius:10px;box-shadow:0 4px 14px #263b5214;border:1px solid #e1e6eb}.metric strong{display:block;font-size:34px;line-height:1}.metric span{display:block;margin-top:7px;color:#6a7784;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.6px}.metric.tests{border-top:5px solid #e3223d}.metric.tests strong{color:#d71935}.metric.success{border-top:5px solid #20864b}.metric.success strong{color:#17713d}.metric.failure{border-top:5px solid #c9363e}.metric.failure strong{color:#a82431}.content{padding:30px 36px 42px}.section-heading{display:flex;align-items:center;justify-content:space-between;margin:0 0 18px}.section-heading h2{margin:0;font-size:20px}.section-heading span{color:#748190;font-size:13px}
.test-card{border:1px solid #dce2e7;border-left:6px solid #d71935;border-radius:11px;margin-bottom:18px;overflow:hidden;box-shadow:0 4px 16px #263b5210;background:#fff}.test-card.setup-card{border-left-color:#8795a3;box-shadow:none}.test-card>summary{cursor:pointer;padding:18px 20px;background:#f8fafb;list-style:none;display:flex;justify-content:space-between;align-items:center;gap:18px}.test-card>summary::-webkit-details-marker{display:none}.test-card>summary:after{content:"+";font-size:24px;color:#84909b}.test-card[open]>summary:after{content:"−"}.test-head-left{display:flex;align-items:center;gap:14px;min-width:0}.test-number{display:flex;align-items:center;justify-content:center;min-width:70px;padding:9px 10px;border-radius:8px;background:#d71935;color:#fff;font-size:12px;font-weight:900;letter-spacing:.5px}.setup-card .test-number{background:#748190}.test-name{display:block;font-size:16px;font-weight:800}.test-original{display:block;margin-top:4px;color:#71808d;font-size:12px;font-weight:500}.test-status{display:flex;align-items:center;gap:12px;margin-left:auto}.status-dot{width:9px;height:9px;border-radius:50%;background:#8795a3}.status-dot.passed{background:#20a45a;box-shadow:0 0 0 5px #20a45a18}.status-dot.passed-warning{background:#e6a700;box-shadow:0 0 0 5px #e6a70022}.status-dot.failed,.status-dot.timedOut,.status-dot.interrupted{background:#d71935;box-shadow:0 0 0 5px #d7193518}
.badge{padding:6px 11px;border-radius:20px;font-size:12px;font-weight:800}.passed{background:#d9f3e2;color:#176b38}.passed-warning{background:#fff0b3;color:#765500}.failed,.timedOut,.interrupted{background:#f9dada;color:#9b2727}.skipped{background:#e7eaed;color:#59636c}.body{padding:20px}.meta{color:#697783;margin-bottom:18px}
.jobs{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin-top:14px}.job{padding:10px 12px;border:1px solid #dce2e7;border-radius:6px;background:#fbfcfd;font-weight:650}.job.validation-failed{border-color:#e3a6ad;border-left:5px solid #d71935;background:#fff2f3;color:#9b2733}.validation-passed{padding:14px 16px;border-left:5px solid #20864b;border-radius:7px;background:#ecf8f0;color:#176b38;font-weight:750}.error{white-space:pre-wrap;background:#fff1f1;border-left:4px solid #ca3434;padding:14px;color:#842626}.warning{margin:12px 0;padding:14px 16px;border-left:5px solid #e6a700;border-radius:7px;background:#fff5cc;color:#765500;font-weight:750}.warning-text{color:#9a6800;font-weight:800}.empty{color:#77838e;padding:12px 0}
.job-search{width:100%;margin:4px 0 2px;padding:12px 14px;border:1px solid #aeb9c3;border-radius:7px;font:inherit;color:#25364a}.job-search:focus{outline:3px solid #1266a833;border-color:#1266a8}.dispatch-job{margin-top:18px;border:1px solid #ccd6df;border-radius:10px;overflow:visible;background:#fff;box-shadow:0 5px 18px #263b5212}.dispatch-job>summary{position:sticky;top:0;z-index:5;display:flex;justify-content:space-between;align-items:center;gap:16px;padding:14px 18px;background:linear-gradient(100deg,#20374e,#304c68);color:#fff;border-radius:9px;box-shadow:0 4px 12px #17263830}.dispatch-job>summary .title{padding:6px 11px;background:#d71935;border-radius:6px;color:#fff;font-size:15px;letter-spacing:.2px}.dispatch-job>summary>span:last-child{font-size:13px;font-weight:700;color:#eaf1f6}.dispatch-body{padding:16px 18px 20px}.dispatch-summary{display:grid;grid-template-columns:repeat(3,minmax(150px,1fr));gap:10px;margin:0 0 20px;padding:14px;background:#eef2f6;border:1px solid #d8e0e7;border-top:4px solid #d71935;border-radius:0 0 9px 9px}.dispatch-summary div{min-height:70px;padding:12px;background:#fff;border:1px solid #e1e7ec;border-radius:7px;box-shadow:0 2px 6px #263b520b;font-size:16px;font-weight:700}.dispatch-summary div:nth-child(3),.dispatch-summary div:nth-child(4),.dispatch-summary div:nth-child(5){border-top:4px solid #d71935}.dispatch-summary div:nth-child(6){border-top:4px solid #2477b3}.dispatch-summary strong{display:block;color:#607080;font-size:11px;line-height:1.25;margin-bottom:7px;text-transform:uppercase;letter-spacing:.35px}.table-wrap{overflow-x:auto;margin:10px 0 22px}table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:10px;border:1px solid #dce2e7;text-align:left;vertical-align:top}th{background:#263b52;color:#fff}tbody tr:nth-child(even){background:#f8fafb}.validation-row-failed td{background:#fff0f1!important;border-color:#e4a8af;color:#8f1f2c}.equipment-summary{display:grid;grid-template-columns:repeat(3,minmax(150px,1fr));gap:10px;margin-bottom:18px}.equipment-summary div{padding:14px;border-top:4px solid #2477b3;border-radius:7px;background:#f5f8fb;font-weight:750}.equipment-summary strong{display:block;margin-bottom:5px;color:#687887;font-size:11px;text-transform:uppercase}.equipment-filter{display:flex;align-items:center;gap:12px;margin:16px 0}.equipment-filter select{min-width:180px;padding:9px 12px;border:1px solid #aeb9c3;border-radius:6px;background:#fff;font:inherit}.equipment-in-use td{background:#edf9f1}.equipment-problem td{background:#fff0f1!important;border-color:#e4a8af}.key-on{color:#176b38;font-weight:800}.equipment-visible-count{color:#687887;font-weight:700}.view-link,.has-images{color:#1266a8;font-weight:700}.images-pending{color:#8a5a00;background:#fff4d6;font-weight:700}.section-title{margin:18px 0 8px}.job-errors{margin-top:28px;padding-top:18px;border-top:3px solid #ca3434}.job-error{margin-top:14px;border:1px solid #e4baba;border-radius:8px;padding:16px;background:#fff8f8}.job-error h4{margin:0 0 10px;color:#9b2727}.job-error-url{overflow-wrap:anywhere;color:#59636c}.job-error img{display:block;width:100%;height:auto;margin-top:14px;border:1px solid #ccd3d9;border-radius:6px}.search-empty{display:none;margin-top:16px;color:#77838e}
@media(max-width:900px){.dispatch-summary{grid-template-columns:repeat(2,minmax(140px,1fr))}}@media(max-width:700px){.wrap{margin:0;border-radius:0}.header-row{align-items:flex-start;flex-direction:column}.summary{grid-template-columns:1fr;padding:18px}.content{padding:22px 18px}.test-card>summary{align-items:flex-start;flex-wrap:wrap}.test-status{margin-left:84px}header{padding:30px 22px}.section-heading{align-items:flex-start;flex-direction:column;gap:5px}.dispatch-job>summary{top:0;align-items:flex-start;flex-direction:column}.dispatch-summary{grid-template-columns:1fr}}

/* Modern dashboard theme */
:root{--navy:#102235;--navy-2:#1d3852;--red:#e31937;--red-2:#ff4964;--blue:#2684ff;--green:#13a05f;--ink:#172538;--muted:#68778a;--line:#dbe4ec;--surface:#fff;--soft:#f5f8fb}
body{min-height:100vh;background:radial-gradient(circle at 8% 0%,#dceaff 0,transparent 30%),radial-gradient(circle at 94% 12%,#ffdce2 0,transparent 27%),linear-gradient(145deg,#edf3f9,#f8fafc 48%,#f7eef1);background-attachment:fixed;color:var(--ink)}
.wrap{max-width:1480px;margin:28px auto 60px;border:1px solid #ffffffb8;border-radius:28px;background:#fffffff2;box-shadow:0 30px 90px #10223524,0 2px 10px #10223512;backdrop-filter:blur(18px)}
header{isolation:isolate;padding:42px 48px 38px;background:linear-gradient(120deg,#0d1c2b 0%,#17334d 62%,#6c1225 100%);overflow:hidden}
header:before{content:"";position:absolute;z-index:-1;inset:-100px -40px auto auto;width:410px;height:410px;border:1px solid #ffffff1f;border-radius:50%;box-shadow:0 0 0 55px #ffffff09,0 0 0 110px #ffffff07}
header:after{right:auto;left:48px;bottom:0;width:84px;height:6px;background:linear-gradient(90deg,var(--red),var(--red-2));box-shadow:96px 0 #ffffff35}
header h1{font-size:38px;letter-spacing:-1.2px}.header-copy{color:#cbd9e6;font-size:15px}.eyebrow{color:#ff8395}.setup-status{padding:10px 16px;border-color:#ffffff38;background:#ffffff16;box-shadow:inset 0 1px #ffffff25;backdrop-filter:blur(8px)}
.header-meta{display:grid;gap:8px;min-width:230px}.header-meta-item{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:9px 12px;border:1px solid #ffffff2b;border-radius:10px;background:#ffffff12;box-shadow:inset 0 1px #ffffff1f;backdrop-filter:blur(8px);font-size:12px}.header-meta-item span{color:#bfcddd;font-weight:600}.header-meta-item strong{color:#fff;font-size:13px}.header-meta-item.report-date{border-color:#ff718750;background:#e3193726}.header-meta-item.report-date strong{color:#ffb2bd}
.summary{position:relative;grid-template-columns:repeat(3,minmax(190px,1fr));gap:18px;padding:24px 48px;background:linear-gradient(180deg,#f8fbfd,#f3f7fa)}
.metric{position:relative;overflow:hidden;padding:22px 24px;border:1px solid #fff;border-radius:16px;box-shadow:0 9px 24px #203a5212;transition:transform .2s ease,box-shadow .2s ease}.metric:hover{transform:translateY(-3px);box-shadow:0 14px 30px #203a5220}.metric:after{position:absolute;right:18px;top:14px;width:42px;height:42px;display:grid;place-items:center;border-radius:13px;font-size:20px;font-weight:900}.metric.tests:after{content:"#";background:#ffe7eb;color:var(--red)}.metric.success:after{content:"✓";background:#dcf7e9;color:var(--green)}.metric.failure:after{content:"!";background:#ffe2e5;color:#c5233c}.metric strong{font-size:38px}.metric.tests,.metric.success,.metric.failure{border-top:1px solid #fff}.metric.tests:before,.metric.success:before,.metric.failure:before{content:"";position:absolute;inset:0 auto 0 0;width:5px}.metric.tests:before{background:var(--red)}.metric.success:before{background:var(--green)}.metric.failure:before{background:#c5233c}
.content{padding:34px 48px 52px}.section-heading{margin-bottom:20px}.section-heading h2{font-size:24px;letter-spacing:-.4px}.report-actions{display:flex;align-items:center;gap:8px}.report-action{appearance:none;padding:9px 13px;border:1px solid var(--line);border-radius:10px;background:#fff;color:#34475a;font:700 12px Segoe UI,Arial,sans-serif;cursor:pointer;box-shadow:0 3px 9px #21384d0b;transition:.18s ease}.report-action:hover{border-color:#9aabbb;background:#f7fafc;transform:translateY(-1px)}
.test-card{border:1px solid #dfe7ee;border-left:0;border-radius:16px;margin-bottom:16px;box-shadow:0 7px 24px #1b344b0b;transition:box-shadow .2s ease,transform .2s ease}.test-card:hover{box-shadow:0 12px 32px #1b344b16}.test-card:before{content:"";position:absolute}.test-card>summary{min-height:82px;padding:18px 22px;border-left:6px solid var(--red);background:linear-gradient(100deg,#fff,#f7fafc)}.test-card.setup-card>summary{border-left-color:#8090a0}.test-card[open]>summary{border-bottom:1px solid #e5ebf0}.test-card>summary:after{content:"⌄";font-size:22px;transition:transform .2s ease}.test-card[open]>summary:after{content:"⌄";transform:rotate(180deg)}.test-number{border-radius:10px;background:linear-gradient(135deg,var(--red),#bd1230);box-shadow:0 6px 14px #d7193530}.test-name{font-size:17px}.badge{letter-spacing:.35px}.body{padding:24px 26px 28px}.meta{display:inline-flex;padding:7px 11px;border-radius:8px;background:#f2f6f9;color:#607184;font-size:13px}
.job-search{margin-top:8px;padding:14px 16px;border-color:#cad5df;border-radius:12px;background:#f9fbfd;transition:.18s ease}.job-search:focus{background:#fff;box-shadow:0 0 0 4px #2684ff18}.dispatch-job{border-color:#dbe4eb;border-radius:15px;box-shadow:0 7px 20px #1a354e0d}.dispatch-job>summary{padding:14px 18px;border-radius:14px;background:linear-gradient(105deg,#142a3f,#284b69);box-shadow:0 6px 16px #132a4030}.dispatch-job>summary .title{background:linear-gradient(135deg,var(--red),#b50f2a);box-shadow:0 4px 12px #d7193545}.dispatch-body{padding:20px}.dispatch-summary,.equipment-summary{grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;padding:0;border:0;background:transparent}.dispatch-summary div,.equipment-summary div{min-height:82px;padding:15px 16px;border:1px solid #e3eaf0;border-top:1px solid #e3eaf0!important;border-radius:12px;background:linear-gradient(145deg,#fff,#f5f8fb);box-shadow:0 5px 14px #19334c0b;font-size:18px}.dispatch-summary div:before,.equipment-summary div:before{content:"";display:block;width:28px;height:3px;margin-bottom:11px;border-radius:2px;background:linear-gradient(90deg,var(--red),var(--red-2))}.equipment-summary div:before{background:linear-gradient(90deg,var(--blue),#71b0ff)}.dispatch-summary strong,.equipment-summary strong{color:#67798a;font-size:10px;letter-spacing:.55px}
.table-wrap{border:1px solid #dfe7ed;border-radius:13px;box-shadow:0 6px 18px #18334c0a}table{border-collapse:separate;border-spacing:0}th,td{padding:12px 13px;border:0;border-bottom:1px solid #e4eaf0}th{position:sticky;top:0;z-index:2;background:#1b334a;color:#f7fbff;font-size:11px;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap}th:first-child{border-radius:11px 0 0}th:last-child{border-radius:0 11px 0 0}tbody tr{transition:background .14s ease}tbody tr:hover td{background:#edf5fc!important}tbody tr:last-child td{border-bottom:0}.equipment-in-use td{background:#edf9f3}.equipment-problem td,.validation-row-failed td{background:#fff0f2!important}.equipment-warning td{background:#fff8dc!important;border-color:#ead58a}.view-link{color:#0876e1;text-decoration:none}.view-link:hover{text-decoration:underline}.key-on{display:table-cell;color:#087a46}.equipment-filter{position:sticky;top:8px;z-index:4;justify-content:space-between;padding:12px 14px;border:1px solid #dce5ec;border-radius:12px;background:#fffffff2;box-shadow:0 8px 22px #17334c12;backdrop-filter:blur(12px)}.equipment-filter select{border-radius:9px}.validation-passed{border:1px solid #bfe9d1;border-left:5px solid var(--green);border-radius:11px;background:linear-gradient(100deg,#ebfaf2,#f7fffa)}
.job-errors{border-radius:13px!important}.job-error{border-radius:12px}.job-error img{border-radius:10px}.section-title{margin-top:24px;font-size:16px}.empty{padding:18px;border:1px dashed #cbd6df;border-radius:10px;background:#f8fafc}
.validation-job>summary{position:relative;top:auto}.validation-job-metrics{display:flex;align-items:center;justify-content:flex-end;gap:18px;flex:1}.validation-job-metrics>span:not(.badge){color:#d7e3ed;font-size:11px;font-weight:600;text-transform:uppercase}.validation-job-metrics strong{display:block;margin-top:2px;color:#fff;font-size:15px}.duplicate-card{margin:4px 0 18px;padding:16px;border:1px solid #f0b9c1;border-left:5px solid var(--red);border-radius:12px;background:#fff8f9}.duplicate-card h4{margin:0 0 12px;color:#a62238;font-size:16px}.duplicate-card h4 span{margin-left:8px;color:#5e6f80;font-size:13px;font-weight:600}.duplicate-card .table-wrap{margin-bottom:0;background:#fff}
.passed-jobs-group{margin-top:22px;border:1px solid #cfe3d8;border-radius:13px;background:#f4fbf7;overflow:hidden}.passed-jobs-group>summary{padding:15px 18px;color:#187044;font-weight:800;cursor:pointer;list-style:none}.passed-jobs-group>summary:before{content:"✓";display:inline-grid;place-items:center;width:24px;height:24px;margin-right:9px;border-radius:50%;background:#d7f3e3}.passed-jobs-group>summary:after{content:"Show details";float:right;color:#6f8178;font-size:11px;font-weight:700;text-transform:uppercase}.passed-jobs-group[open]>summary:after{content:"Hide details"}.passed-jobs-body{padding:0 14px 14px}.passed-jobs-body .validation-job{box-shadow:none;opacity:.9}
@media(max-width:700px){.wrap{margin:0;border-radius:0}.summary{padding:18px}.content{padding:24px 16px}.report-actions{width:100%;margin-top:8px}.report-action{flex:1}.test-card>summary{padding:15px}.test-number{min-width:58px}.test-status{margin-left:72px}.body{padding:18px 14px}.equipment-filter{align-items:flex-start;flex-direction:column}.equipment-filter select{width:100%;margin-top:7px}.validation-job-metrics{align-items:flex-start;flex-wrap:wrap;justify-content:flex-start}.validation-job-metrics>span{min-width:64px}}
</style></head><body><main class="wrap"><header><p class="eyebrow">Quality Automation</p><div class="header-row"><div><h1>IBT Hub Test Report</h1><p class="header-copy">Dispatch data and inspection integrity results</p></div><div class="header-meta"><div class="header-meta-item report-date"><span>Report Date</span><strong>${this.escape(reportDate)}</strong></div><div class="header-meta-item"><span>Generated</span><strong>${this.escape(generatedAt)}</strong></div><div class="header-meta-item"><span>Azure setup</span><strong>${setupEntry?.status.toUpperCase() ?? 'NOT RUN'}</strong></div></div></div></header><section class="summary"><div class="metric tests"><strong>${functionalEntries.length}</strong><span>Functional Tests</span></div><div class="metric success"><strong>${passed}</strong><span>Passed</span></div><div class="metric failure"><strong>${failed}</strong><span>Failed</span></div></section><section class="content"><div class="section-heading"><div><h2>Test Cases</h2><span>Open a test to explore its evidence</span></div><div class="report-actions"><button class="report-action" type="button" data-action="expand">Expand all</button><button class="report-action" type="button" data-action="collapse">Collapse all</button></div></div>${testCards}</section></main><script>document.querySelectorAll('.job-search').forEach(function(input){input.addEventListener('input',function(){var report=input.closest('.dispatch-report');var query=input.value.trim().toLowerCase();var visible=0;report.querySelectorAll('[data-job-number]').forEach(function(item){var match=item.dataset.jobNumber.toLowerCase().includes(query);item.hidden=!match;if(match)visible+=1;});report.querySelector('.search-empty').style.display=visible===0?'block':'none';});});document.querySelectorAll('.equipment-use-filter').forEach(function(select){select.addEventListener('change',function(){var report=select.closest('.equipment-report');var visible=0;report.querySelectorAll('tbody tr[data-in-use]').forEach(function(row){var show=select.value==='all'||row.dataset.inUse===select.value;row.hidden=!show;if(show)visible+=1;});report.querySelector('.equipment-visible-count').textContent=visible+' equipment items shown';});});document.querySelectorAll('.report-action').forEach(function(button){button.addEventListener('click',function(){var open=button.dataset.action==='expand';document.querySelectorAll('.test-card').forEach(function(card){card.open=open;});});});</script></body></html>`;
  }

  private renderEntry(entry: ReportEntry, testNumber: number | undefined): string {
    const jobs = entry.jobNumbers?.jobNumbers ?? [];
    const evidence = entry.dispatchDetails
      ? this.renderDispatchDetails(entry.dispatchDetails)
      : entry.inspectionValidation
        ? this.renderInspectionValidation(entry.inspectionValidation)
        : entry.imageInspectionValidation
          ? this.renderImageInspectionValidation(entry.imageInspectionValidation)
          : entry.equipmentReport
            ? this.renderEquipmentReport(entry.equipmentReport)
            : entry.inspectorValidation
              ? this.renderInspectorValidation(entry.inspectorValidation)
              : jobs.length
                ? `<h3>Extracted Job Numbers</h3><div class="jobs">${jobs.map((job) => `<div class="job">${this.escape(job)}</div>`).join('')}</div>`
                : `<div class="empty">${this.escape(entry.jobNumbers?.message ?? (entry.status === 'passed' ? 'Authentication setup completed successfully.' : 'No structured evidence attached to this test.'))}</div>`;
    const isSetup = testNumber === undefined;
    const displayName = this.getDisplayName(entry);
    const statusClass =
      entry.status === 'passed' && (entry.inspectorValidation?.missingForemanCount ?? 0) > 0
        ? 'passed-warning'
        : entry.status;
    const error =
      entry.error &&
      !entry.inspectionValidation &&
      !entry.imageInspectionValidation &&
      !entry.equipmentReport &&
      !entry.inspectorValidation
        ? `<div class="error">${this.escape(entry.error)}</div>`
        : '';
    return `<details class="test-card ${isSetup ? 'setup-card' : ''}"><summary><span class="test-head-left"><span class="test-number">${isSetup ? 'SETUP' : `TEST ${testNumber}`}</span><span><span class="test-name">${this.escape(displayName)}</span><span class="test-original">${this.escape(entry.title)}</span></span></span><span class="test-status"><span class="status-dot ${statusClass}"></span><span class="badge ${statusClass}">${entry.status.toUpperCase()}</span></span></summary><div class="body"><div class="meta">Duration: ${(entry.duration / 1000).toFixed(1)}s${entry.jobNumbers ? ` &bull; Extracted: ${entry.jobNumbers.count} Job Numbers` : ''}${entry.dispatchDetails ? ` &bull; Jobs inspected: ${entry.dispatchDetails.jobCount}` : ''}</div>${error}${evidence}</div></details>`;
  }

  private isSetupEntry(entry: ReportEntry): boolean {
    return /^authenticate with azure$/i.test(entry.title);
  }

  private getDisplayName(entry: ReportEntry): string {
    if (this.isSetupEntry(entry)) return 'Azure Authentication Setup';
    if (entry.dispatchDetails || /extracts dispatch and equipment details/i.test(entry.title)) {
      return 'Dispatch Data Extraction';
    }
    if (entry.inspectionValidation || /matches submitted inspection totals/i.test(entry.title)) {
      return 'Inspection & PDF Link Validation';
    }
    if (entry.imageInspectionValidation || /requires inspection submitted today yes.*image link/i.test(entry.title)) {
      return 'Image Link — Inspection Validation';
    }
    if (entry.equipmentReport || /extracts all equipment and reports equipment without a foreman/i.test(entry.title)) {
      return 'Equipment Inspection Report';
    }
    if (entry.inspectorValidation || /reports inspected equipment without an inspector/i.test(entry.title)) {
      return 'Inspected Equipment — Inspector & Foreman Validation';
    }
    if (entry.jobNumbers || /extracts all job numbers/i.test(entry.title)) return 'Job Number List Extraction';
    if (/opens successfully/i.test(entry.title)) return 'IBT Hub Home Page';
    return entry.title;
  }

  private renderInspectionValidation(artifact: InspectionCountValidationArtifact): string {
    if (artifact.jobs.length === 0) return '<div class="empty">No Job Numbers were available for validation.</div>';
    const renderJob = (job: InspectionCountValidationArtifact['jobs'][number]): string => {
      const duplicates = job.duplicateEquipment
        .map(
          (duplicate) =>
            `<section class="duplicate-card"><h4>EQ ${this.escape(duplicate.equipmentNumber)} <span>${this.escape(duplicate.assetDescription)}</span></h4><div class="table-wrap"><table><thead><tr><th>Inspection</th><th>Date &amp; Time</th><th>Time</th><th>PDF</th></tr></thead><tbody>${duplicate.inspections
              .map(
                (inspection, index) =>
                  `<tr><td>Inspection ${index + 1}</td><td>${this.escape(inspection.inspectedAt)}</td><td><strong>${this.escape(inspection.inspectionTime)}</strong></td><td><a class="view-link" href="${this.escape(inspection.pdfUrl)}" target="_blank" rel="noopener noreferrer">Open PDF</a></td></tr>`
              )
              .join('')}</tbody></table></div></section>`
        )
        .join('');
      const details = duplicates || '<div class="empty">No duplicate equipment inspections found in the ZIP.</div>';
      return `<details class="dispatch-job validation-job" data-job-number="${this.escape(job.jobNumber)}" ${job.duplicateEquipment.length > 0 || !job.matched ? 'open' : ''}><summary><span class="title">JN ${this.escape(job.jobNumber)}</span><span class="validation-job-metrics"><span>Submitted <strong>${job.expectedSubmittedInspections}</strong></span><span>Yes rows <strong>${job.submittedInspectionRows}</strong></span><span>PDF links <strong>${job.inspectionPdfLinks}</strong></span><span>Duplicates <strong>${job.duplicateEquipment.length}</strong></span><span class="badge ${job.matched ? 'passed' : 'failed'}">${job.matched ? 'PASSED' : 'FAILED'}</span></span></summary><div class="dispatch-body">${details}</div></details>`;
    };
    const problemJobs = artifact.jobs.filter((job) => !job.matched || job.duplicateEquipment.length > 0);
    const passedJobs = artifact.jobs.filter((job) => job.matched && job.duplicateEquipment.length === 0);
    const problems = problemJobs.map(renderJob).join('');
    const passed = passedJobs.map(renderJob).join('');
    const passedGroup = passed
      ? `<details class="passed-jobs-group"><summary>Show passed Job Numbers (${passedJobs.length})</summary><div class="passed-jobs-body">${passed}</div></details>`
      : '';
    const allPassed =
      problemJobs.length === 0
        ? '<div class="validation-passed">All Job Numbers passed inspection and PDF link validation.</div>'
        : '';
    return `<div class="meta">Validated: ${artifact.jobCount} Job Numbers &bull; Problems: ${problemJobs.length}<br>Only Job Numbers with mismatches or duplicate equipment are shown below. ZIP files are processed temporarily and deleted immediately.</div>${allPassed}${problems}${passedGroup}`;
  }

  private renderImageInspectionValidation(artifact: ImageInspectionValidationArtifact): string {
    const summary = `<div class="equipment-summary"><div><strong>Report Date</strong>${this.escape(artifact.reportDate)}</div><div><strong>Image links checked</strong>${artifact.checkedImageLinks}</div><div><strong>Links without Inspected Yes</strong>${artifact.violationCount}</div></div>`;
    if (artifact.violations.length === 0) {
      return `<div class="equipment-report">${summary}<div class="validation-passed">Validation passed: every equipment image link belongs to a row marked Inspection Submitted Today Yes.</div></div>`;
    }
    const violationsByJob = new Map<string, ImageInspectionValidationArtifact['violations']>();
    for (const violation of artifact.violations) {
      const existing = violationsByJob.get(violation.jobNumber) ?? [];
      violationsByJob.set(violation.jobNumber, [...existing, violation]);
    }
    const jobs = [...violationsByJob.entries()]
      .map(
        ([jobNumber, violations], index) =>
          `<details class="dispatch-job" ${index === 0 ? 'open' : ''}><summary><span class="title">JN ${this.escape(jobNumber)}</span><span>${violations.length} equipment ${violations.length === 1 ? 'violation' : 'violations'}</span></summary><div class="dispatch-body"><div class="table-wrap"><table><thead><tr><th>Asset Description</th><th>Inspection Submitted Today</th><th>Images</th><th>Validation</th></tr></thead><tbody>${violations
            .map(
              (item) =>
                `<tr class="validation-row-failed"><td>${this.escape(item.assetDescription)}</td><td><strong>${this.escape(item.inspectionSubmittedToday)}</strong></td><td><a class="view-link" href="${this.escape(item.imagesUrl)}" target="_blank" rel="noopener noreferrer">View images</a></td><td><span class="badge failed">IMAGE WITHOUT INSPECTION</span></td></tr>`
            )
            .join('')}</tbody></table></div></div></details>`
      )
      .join('');
    return `<div class="equipment-report">${summary}<div class="error">Problem only when an equipment row has an image link and Inspection Submitted Today is not Yes. An inspection without images is allowed.</div>${jobs}</div>`;
  }

  private renderEquipmentReport(artifact: EquipmentReportArtifact): string {
    const inUseCount = artifact.equipment.filter((item) => item.inUse).length;
    const reportDate = `<div><strong>Report Date</strong>${this.escape(artifact.reportDate)}</div>`;
    return `<div class="equipment-report"><div class="equipment-summary">${reportDate}<div><strong>Total Equipment</strong>${artifact.totalEquipment}</div><div><strong>Reported In Use</strong>${artifact.inUse}</div><div><strong>Key On rows (In Use)</strong>${inUseCount}</div><div><strong>Not In Use</strong>${artifact.notInUse}</div><div><strong>Inspected</strong>${artifact.inspected}</div><div><strong>Missing Inspections</strong>${artifact.missingInspections}</div><div><strong>Active Alerts</strong>${artifact.activeAlerts}</div><div><strong>Missing Foreman</strong>${artifact.missingForemanCount}</div><div><strong>Inspected without Inspector</strong>${artifact.missingInspectorCount}</div><div><strong>Extracted Rows</strong>${artifact.extractedCount}</div></div><div class="equipment-filter"><label><strong>In Use filter</strong> <select class="equipment-use-filter"><option value="all">All equipment</option><option value="true" selected>In Use only</option><option value="false">Not In Use only</option></select></label><span class="equipment-visible-count">${inUseCount} equipment items shown</span></div><div class="table-wrap"><table><thead><tr><th>Job</th><th>Foreman</th><th>Inspector</th><th>Equipment</th><th>Description</th><th>In Use</th><th>Inspected</th><th>Date</th><th>Pictures</th><th>Status</th><th>Reason</th></tr></thead><tbody>${artifact.equipment
      .map(
        (item) =>
          `<tr data-in-use="${String(item.inUse)}" ${item.inUse ? '' : 'hidden'} class="${item.missingInspector ? 'equipment-problem' : item.missingForeman ? 'equipment-warning' : item.inUse ? 'equipment-in-use' : ''}"><td>${this.escape(item.jobNumber)}</td><td>${item.missingForeman ? '<strong class="warning-text">MISSING</strong>' : this.escape(item.foreman)}</td><td>${item.missingInspector ? '<strong class="failed">MISSING</strong>' : this.escape(item.inspector)}</td><td>${this.escape(item.equipmentNumber)}</td><td>${this.escape(item.description)}</td><td class="${item.inUse ? 'key-on' : ''}">${this.escape(item.inUse ? 'Yes — Key On' : item.inUseLabel)}</td><td>${this.escape(item.inspectedLabel)}</td><td>${this.escape(item.date)}</td><td>${this.escape(item.pictures)}</td><td>${this.escape(item.status)}</td><td>${this.escape(item.reason)}</td></tr>`
      )
      .join('')}</tbody></table></div></div>`;
  }

  private renderInspectorValidation(artifact: InspectorValidationArtifact): string {
    if (artifact.inspections.length === 0) {
      return `<div class="equipment-report"><div class="equipment-summary"><div><strong>Report Date</strong>${this.escape(artifact.reportDate)}</div><div><strong>Inspected Yes checked</strong>${artifact.inspectedCount}</div><div><strong>Yes without Inspector</strong>0</div><div><strong>Yes without Foreman</strong>0</div></div><div class="validation-passed">Validation passed: every equipment item marked Inspected Yes has an Inspector and a Foreman.</div></div>`;
    }
    const inspectorFinding =
      artifact.missingInspectorCount > 0
        ? '<div class="error">FAILED: one or more rows are marked Inspected Yes but do not have an Inspector.</div>'
        : '';
    const foremanWarning =
      artifact.missingForemanCount > 0
        ? '<div class="warning">WARNING: one or more rows are marked Inspected Yes but do not have a Foreman. This warning does not fail the test.</div>'
        : '';
    return `<div class="equipment-report"><div class="equipment-summary"><div><strong>Report Date</strong>${this.escape(artifact.reportDate)}</div><div><strong>Inspected Yes checked</strong>${artifact.inspectedCount}</div><div><strong>Yes without Inspector</strong>${artifact.missingInspectorCount}</div><div><strong>Yes without Foreman</strong>${artifact.missingForemanCount}</div></div>${inspectorFinding}${foremanWarning}<div class="table-wrap"><table><thead><tr><th>Job</th><th>Equipment</th><th>Description</th><th>Inspected</th><th>Foreman</th><th>Inspector</th><th>Date</th><th>Pictures</th><th>Status</th></tr></thead><tbody>${artifact.inspections
      .map(
        (item) =>
          `<tr class="${item.missingInspector ? 'equipment-problem' : 'equipment-warning'}"><td>${this.escape(item.jobNumber)}</td><td>${this.escape(item.equipmentNumber)}</td><td>${this.escape(item.description)}</td><td><strong>Yes</strong></td><td>${item.missingForeman ? '<strong class="warning-text">MISSING</strong>' : this.escape(item.foreman)}</td><td>${item.missingInspector ? '<strong class="failed">MISSING</strong>' : this.escape(item.inspector)}</td><td>${this.escape(item.date)}</td><td>${this.escape(item.pictures)}</td><td>${this.escape(item.status)}</td></tr>`
      )
      .join('')}</tbody></table></div></div>`;
  }

  private renderDispatchDetails(artifact: DispatchDetailsArtifact): string {
    const inspected = artifact.jobs
      .map((job, index) => this.renderDispatchJob(job, index, artifact.imagesIncluded !== false))
      .join('');
    const skippedJobs = artifact.skippedJobs ?? [];
    const skipped = skippedJobs
      .map(
        (job) =>
          `<article class="job-error" data-job-number="${this.escape(job.jobNumber)}"><h4>JN ${this.escape(job.jobNumber)}</h4><div class="error">${this.escape(job.reason)}</div><p class="job-error-url"><strong>Final page:</strong> ${this.escape(job.pageUrl)}</p><img src="data:image/png;base64,${job.screenshotBase64}" alt="Screenshot showing the error for JN ${this.escape(job.jobNumber)}"></article>`
      )
      .join('');
    const empty =
      artifact.jobs.length === 0 && skippedJobs.length === 0 ? '<div class="empty">No dispatches today</div>' : '';
    const errors = skipped
      ? `<details class="job-errors" style="padding-top:0;border:1px solid #e4a8af;border-left:5px solid #ca3434;border-radius:8px;overflow:hidden"><summary style="display:flex;justify-content:space-between;align-items:center;gap:16px;padding:15px 17px;background:#fff3f4;color:#8f1f2c;cursor:pointer"><span class="title">Job Numbers with errors (${skippedJobs.length})</span><span style="font-size:12px;font-weight:700">Click to view details</span></summary><div class="dispatch-body"><p>These Job Numbers could not be extracted. The final page and screenshot are shown below.</p>${skipped}</div></details>`
      : '';
    const search =
      artifact.jobs.length > 0 || skippedJobs.length > 0
        ? '<label><strong>Search Job Number</strong><input class="job-search" type="search" placeholder="Enter JN, for example 8815" autocomplete="off"></label><div class="search-empty">No matching Job Number found.</div>'
        : '';
    return `<div class="dispatch-report">${search}${inspected}${empty}${errors}</div>`;
  }

  private renderDispatchJob(job: JobDispatchDetails, index: number, imagesIncluded: boolean): string {
    const dispatchedEquipment =
      job.sections.find((section) => section.name === 'All Dispatched Equipment')?.equipment ?? [];
    const inspectionsWithUploadedImages = dispatchedEquipment.filter(
      (item) => /^yes$/i.test(item.inspectionSubmittedToday) && item.imagesLabel === 'View'
    ).length;
    const uploadedImagesCard = imagesIncluded
      ? `<div><strong>Inspections with uploaded images</strong>${inspectionsWithUploadedImages}</div>`
      : '';
    return `<details class="dispatch-job" data-job-number="${this.escape(job.jobNumber)}" ${index === 0 ? 'open' : ''}><summary><span class="title">JN ${this.escape(job.jobNumber)}</span><span>${job.dispatchedEquipment} dispatched equipment</span></summary><div class="dispatch-body"><div class="dispatch-summary">
      <div><strong>Data Date</strong>${this.escape(job.dataDate)}</div><div><strong>Dispatched Equipment</strong>${job.dispatchedEquipment}</div><div><strong>Today's Submitted Inspection</strong>${job.todaysSubmittedInspection}</div><div><strong>Rows marked Yes</strong>${job.submittedInspectionRows}</div><div><strong>Asset Description PDF Links</strong>${job.inspectionPdfLinks}</div>${uploadedImagesCard}
      </div>${job.sections.map((section) => `<h4 class="section-title">${this.escape(section.name)} (${section.equipment.length})</h4>${this.renderEquipmentTable(section.equipment, imagesIncluded)}`).join('')}</div></details>`;
  }

  private renderEquipmentTable(equipment: EquipmentRecord[], imagesIncluded: boolean): string {
    if (equipment.length === 0) return '<div class="empty">No equipment records.</div>';
    const imagesHeader = imagesIncluded ? '<th>Images</th>' : '';
    return `<div class="table-wrap"><table><thead><tr><th>Asset Description</th><th>Category</th><th>Status</th><th>Inspection Submitted Today</th><th>Job #</th>${imagesHeader}</tr></thead><tbody>${equipment
      .map(
        (item) =>
          `<tr><td>${item.inspectionUrl ? `<a class="view-link" href="${this.escape(item.inspectionUrl)}" target="_blank" rel="noopener noreferrer" title="Open inspection PDF in a new tab">${this.escape(item.assetDescription)}</a>` : this.escape(item.assetDescription)}</td><td>${this.escape(item.category)}</td><td>${this.escape(item.status)}</td><td>${this.escape(item.inspectionSubmittedToday)}</td><td>${this.escape(item.jobNumber)}</td>${imagesIncluded ? `<td class="${item.imagesLabel === 'View' ? 'has-images' : item.imagesLabel === 'Not checked - loading' ? 'images-pending' : ''}">${item.imagesUrl ? `<a class="view-link" href="${this.escape(item.imagesUrl)}" target="_blank" rel="noopener noreferrer">View</a>` : this.escape(item.imagesLabel)}</td>` : ''}</tr>`
      )
      .join('')}</tbody></table></div>`;
  }

  private escape(value: string): string {
    return value.replace(
      /[&<>"']/g,
      (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character
    );
  }
}

export default IbtHtmlReporter;
