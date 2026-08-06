# IBT Hub Playwright automation

Playwright end-to-end automation for Graniterock IBT Hub, implemented in TypeScript with Page Objects and a custom HTML report.

## Setup

1. Copy `.env.example` to `.env` and provide `BASE_URL`, `USER_NAME`, and `USER_PASSWORD`.
2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Install Chromium:

   ```bash
   pnpm exec playwright install chromium
   ```

Credentials must remain in `.env`. Never commit this file.

## Useful commands

| Command                                       | Purpose                                                 |
| --------------------------------------------- | ------------------------------------------------------- |
| `pnpm test`                                   | Run all tests headless                                  |
| `pnpm test:smoke`                             | Run all `@smoke` tests                                  |
| `pnpm test:headed`                            | Run all tests with a visible browser                    |
| `pnpm test:ui`                                | Open Playwright UI mode                                 |
| `pnpm test:debug`                             | Run in Playwright debug mode                            |
| `pnpm run test:dispatch:interactive`          | Run selected-date Dispatch and Equipment tests headed   |
| `pnpm run test:dispatch:interactive:headless` | Run selected-date Dispatch and Equipment tests headless |
| `pnpm report:open`                            | Open the standard Playwright HTML report                |
| `pnpm report:open:ibt`                        | Open the custom IBT Hub HTML report                     |
| `pnpm typecheck`                              | Run TypeScript checks                                   |
| `pnpm lint`                                   | Run ESLint                                              |
| `pnpm lint:fix`                               | Apply safe ESLint fixes                                 |
| `pnpm format`                                 | Format the project with Prettier                        |
| `pnpm format:check`                           | Check formatting without changing files                 |
| `pnpm check`                                  | Run TypeScript, ESLint, and Prettier checks             |

In PowerShell, use `pnpm.cmd` instead of `pnpm` if script execution policy blocks `pnpm.ps1`.

## Interactive dispatch run

Visible browser:

```bash
pnpm run test:dispatch:interactive
```

Headless:

```bash
pnpm run test:dispatch:interactive:headless
```

The command asks:

```text
For which month should the test run? (1-12): 8
For which day should the test run? (1-31): 3
Check image links? (Y/N): Y
```

- `Y` or `Yes`: waits for Images, displays image results in the report, and processes 15 Job Number pages in parallel.
- `N` or `No`: does not wait for Images, hides all image fields from the report, and still processes 15 Job Number pages in parallel.
- The current year is selected automatically.
- Dispatch, Equipment Report, and Inspector Validation all use the selected month and day.
- All results are written to the same custom IBT HTML report.
- Missing Foreman and Inspector values are reported as data findings and do not stop the test run.

## Run individual test files

Authentication setup only:

```bash
pnpm exec playwright test specs/config/auth.setup.ts --project=setup
```

Home page:

```bash
pnpm exec playwright test specs/ui/tests/home.spec.ts
```

Job Number list:

```bash
pnpm exec playwright test specs/ui/tests/job-numbers.spec.ts
```

Equipment Inspection Report:

```bash
pnpm exec playwright test specs/ui/tests/equipment-report.spec.ts
```

Equipment Inspection Report with a visible browser:

```bash
pnpm exec playwright test specs/ui/tests/equipment-report.spec.ts --headed
```

Dispatch extraction and inspection validation:

```bash
pnpm exec playwright test specs/ui/tests/dispatch-details.spec.ts
```

Add `--headed` to any Playwright command to display the browser:

```bash
pnpm exec playwright test specs/ui/tests/job-numbers.spec.ts --headed
```

## Run by tag

```bash
pnpm exec playwright test --grep @smoke
pnpm exec playwright test --grep @job-numbers
pnpm exec playwright test --grep @dispatch-details
pnpm exec playwright test --grep @inspection-links
pnpm exec playwright test --grep @equipment-report
pnpm exec playwright test --grep @inspector-validation
```

## Select a date non-interactively

Git Bash:

```bash
DISPATCH_DATE=2026-08-03 pnpm exec playwright test specs/ui/tests/dispatch-details.spec.ts
```

PowerShell:

```powershell
$env:DISPATCH_DATE='2026-08-03'
pnpm.cmd exec playwright test specs/ui/tests/dispatch-details.spec.ts
Remove-Item Env:DISPATCH_DATE
```

When `DISPATCH_DATE` is not set, the application uses today's date.

## Select Job Numbers

Run one exact Job Number in Git Bash:

```bash
JOB_NUMBER=8839 DISPATCH_DATE=2026-08-03 pnpm exec playwright test specs/ui/tests/dispatch-details.spec.ts
```

Run one exact Job Number in PowerShell:

```powershell
$env:JOB_NUMBER='8839'
$env:DISPATCH_DATE='2026-08-03'
pnpm.cmd exec playwright test specs/ui/tests/dispatch-details.spec.ts
Remove-Item Env:JOB_NUMBER
Remove-Item Env:DISPATCH_DATE
```

Run only the first three Job Numbers in Git Bash:

```bash
JOB_LIMIT=3 pnpm exec playwright test specs/ui/tests/dispatch-details.spec.ts
```

Run only the seventh Job Number in Git Bash:

```bash
JOB_OFFSET=6 JOB_LIMIT=1 pnpm exec playwright test specs/ui/tests/dispatch-details.spec.ts
```

PowerShell equivalent:

```powershell
$env:JOB_OFFSET=6
$env:JOB_LIMIT=1
pnpm.cmd exec playwright test specs/ui/tests/dispatch-details.spec.ts
Remove-Item Env:JOB_OFFSET
Remove-Item Env:JOB_LIMIT
```

Clear all Job Number filters in Git Bash:

```bash
unset JOB_NUMBER JOB_LIMIT JOB_OFFSET
```

## Images configuration

Run with Images in Git Bash:

```bash
WAIT_FOR_IMAGES=true IMAGE_PAGE_WORKERS=15 IMAGES_TIMEOUT_MINUTES=15 pnpm exec playwright test specs/ui/tests/dispatch-details.spec.ts
```

Run without Images in Git Bash:

```bash
WAIT_FOR_IMAGES=false pnpm exec playwright test specs/ui/tests/dispatch-details.spec.ts
```

PowerShell equivalents:

```powershell
$env:WAIT_FOR_IMAGES='true'
$env:IMAGE_PAGE_WORKERS=15
$env:IMAGES_TIMEOUT_MINUTES=15
pnpm.cmd exec playwright test specs/ui/tests/dispatch-details.spec.ts
Remove-Item Env:WAIT_FOR_IMAGES
Remove-Item Env:IMAGE_PAGE_WORKERS
Remove-Item Env:IMAGES_TIMEOUT_MINUTES
```

```powershell
$env:WAIT_FOR_IMAGES='false'
pnpm.cmd exec playwright test specs/ui/tests/dispatch-details.spec.ts
Remove-Item Env:WAIT_FOR_IMAGES
```

`IMAGES_TIMEOUT_MINUTES` is a maximum, not a fixed wait. The test continues immediately when every Images spinner on a JN resolves to `View` or `No images`. If the maximum is reached, unresolved rows are reported as `Loading timeout`.

## Run all tests for a specific date

Git Bash:

```bash
unset JOB_NUMBER JOB_LIMIT JOB_OFFSET
DISPATCH_DATE=2026-08-03 pnpm test
```

PowerShell:

```powershell
Remove-Item Env:JOB_NUMBER,Env:JOB_LIMIT,Env:JOB_OFFSET -ErrorAction SilentlyContinue
$env:DISPATCH_DATE='2026-08-03'
pnpm.cmd test
Remove-Item Env:DISPATCH_DATE
```

## Reports

Open the custom IBT Hub report:

```bash
pnpm run report:open:ibt
```

Generated file:

```text
artifacts/local/ibt-hub-report.html
```

Open the standard Playwright report:

```bash
pnpm exec playwright show-report
```

Each new Playwright run overwrites the previous custom report.

## Authentication

Azure authentication runs once as the Playwright setup project and stores the authenticated session in `.state/admin.json`. Chromium tests reuse that session and do not repeat login individually.

## Project structure

- `specs/config/` — Playwright authentication setup
- `specs/ui/tests/` — test scenarios
- `specs/ui/page-objects/` — locators and page actions
- `utils/reporters/` — custom IBT HTML reporter
- `utils/scripts/` — interactive test runners
- `artifacts/local/` — generated custom report
