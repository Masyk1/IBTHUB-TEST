# Bitbucket email report setup

The `scheduled-ibt-tests` pipeline runs the complete Playwright suite. After every test has finished and the IBT HTML report has been generated:

- `REPORT_EMAIL_TO` receives the complete HTML report on every run.
- `DUPLICATE_EMAIL_TO` receives the Test 6 duplicate-inspection report only when duplicates exist.

Configure these as secured Bitbucket Repository Variables:

```text
BASE_URL
USER_NAME
USER_PASSWORD
EMAIL_USER=sender@company.com
EMAIL_PASSWORD=gmail-application-password
REPORT_EMAIL_TO=your.work@company.com
DUPLICATE_EMAIL_TO=your.work@company.com,person.two@company.com,person.three@company.com
```

Never commit real credentials to `.env`, this documentation, or the pipeline YAML.

Create the required schedules in **Repository settings → Pipelines → Schedules** and select the custom `scheduled-ibt-tests` pipeline. Bitbucket schedules use UTC, so account for daylight-saving changes when converting Romanian local time.

The private phone directory remains ignored by Git. If names must appear in Bitbucket-generated duplicate reports, provision that CSV securely in the pipeline and set `PHONE_DIRECTORY_PATH` to its runtime location.
