from __future__ import annotations

import os
import smtplib
from email.message import EmailMessage
from pathlib import Path


def required_environment(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Required environment variable {name} is not configured")
    return value


smtp_host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
smtp_port = int(os.environ.get("SMTP_PORT", "465"))
smtp_username = required_environment("SMTP_USERNAME")
smtp_password = required_environment("SMTP_PASSWORD")
recipient = required_environment("REPORT_EMAIL_TO")
report_date = os.environ.get("REPORT_DATE", "Not specified")
test_outcome = os.environ.get("TEST_OUTCOME", "unknown").upper()
workflow_run_url = os.environ.get("WORKFLOW_RUN_URL", "")
report_path = Path(os.environ.get("REPORT_PATH", "artifacts/local/ibt-hub-report.html"))

if not report_path.is_file():
    raise FileNotFoundError(f"IBT report was not generated at {report_path}")

message = EmailMessage()
message["Subject"] = f"IBT Hub report - {report_date} - {test_outcome}"
message["From"] = smtp_username
message["To"] = recipient
message.set_content(
    "\n".join(
        (
            f"IBT Hub automated test status: {test_outcome}",
            f"Report date: {report_date}",
            "The complete interactive HTML report is attached.",
            f"GitHub Actions run: {workflow_run_url}" if workflow_run_url else "",
        )
    ).strip()
)
message.add_attachment(
    report_path.read_bytes(),
    maintype="text",
    subtype="html",
    filename=f"ibt-hub-report-{report_date}.html",
)

with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=60) as smtp:
    smtp.login(smtp_username, smtp_password)
    smtp.send_message(message)

print(f"IBT report email sent to {recipient}")
