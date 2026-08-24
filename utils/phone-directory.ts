import { createReadStream } from 'node:fs';
import { access, readdir } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'csv-parse';

let directoryPromise: Promise<Map<string, string>> | undefined;

export async function lookupPhoneOwnerName(phoneNumber: string | undefined): Promise<string | undefined> {
  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
  if (!normalizedPhoneNumber) return undefined;
  directoryPromise ??= loadPhoneDirectory();
  return (await directoryPromise).get(normalizedPhoneNumber);
}

function normalizePhoneNumber(value: string | undefined): string | undefined {
  const digits = value?.replace(/\D/g, '') ?? '';
  if (digits.length < 7) return undefined;
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
}

async function loadPhoneDirectory(): Promise<Map<string, string>> {
  const filePath = await resolvePhoneDirectoryPath();
  if (!filePath) return new Map();

  const directory = new Map<string, string>();
  const parser = createReadStream(filePath).pipe(
    parse({ bom: true, columns: true, relax_column_count: true, skip_empty_lines: true, trim: true })
  );

  for await (const value of parser as AsyncIterable<unknown>) {
    if (!isRecord(value)) continue;
    const normalizedPhoneNumber = normalizePhoneNumber(readString(value, 'phonenumber'));
    if (!normalizedPhoneNumber) continue;
    const fullName = [readString(value, 'firstname'), readString(value, 'lastname')]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (fullName && !directory.has(normalizedPhoneNumber)) directory.set(normalizedPhoneNumber, fullName);
  }

  return directory;
}

async function resolvePhoneDirectoryPath(): Promise<string | undefined> {
  const configuredPath = process.env.PHONE_DIRECTORY_PATH?.trim();
  if (configuredPath) {
    const resolvedPath = path.resolve(process.cwd(), configuredPath);
    await access(resolvedPath);
    return resolvedPath;
  }

  const privateDataDirectory = path.resolve(process.cwd(), 'data/private');
  try {
    const preferredPath = path.join(privateDataDirectory, 'phone-directory.csv');
    await access(preferredPath);
    return preferredPath;
  } catch {
    const entries = await readdir(privateDataDirectory, { withFileTypes: true });
    const csvFiles = entries.filter((entry) => entry.isFile() && /\.csv$/i.test(entry.name));
    if (csvFiles.length === 0) return undefined;
    if (csvFiles.length > 1) {
      throw new Error(
        'Multiple private CSV files were found. Set PHONE_DIRECTORY_PATH to select the phone directory file.'
      );
    }
    return path.join(privateDataDirectory, csvFiles[0].name);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value.trim() : '';
}
