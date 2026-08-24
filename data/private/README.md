# Private reference data

Place the phone and name reference file in this directory.

All files in this directory are ignored by Git except this README. Do not remove the corresponding rules from `.gitignore` and never commit personal data.

Recommended file name:

```text
phone-directory.csv
```

If the file has a different name, either keep only one CSV in this directory or configure its path in `.env`:

```text
PHONE_DIRECTORY_PATH=data/private/your-file.csv
```
