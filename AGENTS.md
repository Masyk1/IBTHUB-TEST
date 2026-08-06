# AGENTS.md

Repository-level instructions for Codex agents working on IBT Hub automation.

## Purpose

This repository contains Playwright end-to-end automation for Graniterock IBT Hub:

- Azure authentication
- Job Numbers and dispatch validation
- Page Object Model UI automation
- Custom HTML test reporting

## Architecture

- `specs/ui/tests/` - Playwright test scenarios
- `specs/ui/page-objects/` - locators, page actions, and page assertions
- `utils/reporters/` - custom Playwright reporters
- `artifacts/local/` - generated IBT Hub HTML reports
- `.env` - local credentials and environment URL; never commit this file

## Core Rules

- Keep credentials only in `.env`; never print or commit usernames, passwords, tokens, or storage state.
- Do not weaken assertions merely to make a test pass.
- Treat valid application empty states, such as `No dispatches today`, explicitly in tests and reports.
- Reuse existing page objects and reporter patterns before adding new abstractions.
- Keep changes focused and avoid unrelated formatting or refactoring.

## Playwright Rules

- Keep locators and UI interactions in page objects, not test specs.
- Prefer accessible locators such as `getByRole`, `getByLabel`, and `getByPlaceholder`.
- Avoid XPath, `force: true`, and fixed waits such as `waitForTimeout`.
- Wait for observable UI or network states instead of assuming timing.
- Test names must describe the expected business outcome.
- Keep tests deterministic and safe to run independently.

## Page Object Rules

- Extend `BasePage` and implement `toBeLoaded()`.
- Keep locators `private readonly`.
- Expose public methods for business actions and page reads.
- Return typed data from page-reading methods.

## Reporting Rules

- Attach structured JSON evidence from tests when values must appear in the custom HTML report.
- A passed test must show `PASSED`; failures must retain the actual error.
- Job Number reports must show the extracted count and values.
- When the page shows `No dispatches today`, report zero Job Numbers and the empty-state message.
- Do not fabricate report data or change a failed status to passed.

## TypeScript Rules

- Do not introduce `any` in new or changed code.
- Use explicit return types for exported functions and public page-object methods.
- Keep path aliases in `tsconfig.json` relative and compatible with current TypeScript.

## Required Verification

After code changes, run:

```powershell
.\node_modules\.bin\tsc.cmd --noEmit
.\node_modules\.bin\eslint.cmd .
.\node_modules\.bin\prettier.cmd . --check
```

Run the targeted Playwright test when the change affects test behavior.

## Useful Commands

Run the Job Numbers test with a visible browser:

```powershell
pnpm.cmd exec playwright test specs/ui/tests/job-numbers.spec.ts --headed
```

Open the custom IBT Hub report:

```powershell
pnpm.cmd report:open:ibt
```

## Done Means

A task is complete only when:

- the implementation follows the Page Object Model;
- sensitive data remains outside source control;
- relevant TypeScript, ESLint, and Prettier checks pass;
- the targeted test was run when practical;
- report output reflects the real application result.
