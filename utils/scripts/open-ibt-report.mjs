import { access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const reportPath = path.resolve('artifacts/local/ibt-hub-report.html');

await access(reportPath).catch(() => {
  throw new Error(`IBT report not found: ${reportPath}. Run the tests first.`);
});

const command =
  process.platform === 'win32'
    ? ['powershell', ['-NoProfile', '-Command', 'Start-Process', reportPath]]
    : process.platform === 'darwin'
      ? ['open', [reportPath]]
      : ['xdg-open', [reportPath]];

spawn(command[0], command[1], { stdio: 'ignore' });
console.log(`Opening IBT report: ${reportPath}`);
