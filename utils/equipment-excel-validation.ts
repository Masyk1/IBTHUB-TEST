import ExcelJS, { type Cell, type CellValue } from 'exceljs';
import type { EquipmentExcelMismatch, EquipmentExcelValidationArtifact, EquipmentReportRecord } from '@utils/types';

type ComparableField =
  | 'jobNumber'
  | 'foreman'
  | 'inspector'
  | 'equipmentNumber'
  | 'description'
  | 'inUseLabel'
  | 'inspectedLabel'
  | 'date'
  | 'pictures'
  | 'status'
  | 'reason';

const columns: ReadonlyArray<{ readonly key: ComparableField; readonly headers: readonly string[] }> = [
  { key: 'jobNumber', headers: ['Job', 'Job Number'] },
  { key: 'foreman', headers: ['Foreman'] },
  { key: 'inspector', headers: ['Inspector'] },
  { key: 'equipmentNumber', headers: ['Equipment', 'Equipment Number'] },
  { key: 'description', headers: ['Description'] },
  { key: 'inUseLabel', headers: ['In Use'] },
  { key: 'inspectedLabel', headers: ['Inspected'] },
  { key: 'date', headers: ['Date'] },
  { key: 'pictures', headers: ['Pictures'] },
  { key: 'status', headers: ['Status', 'Final Status'] },
  { key: 'reason', headers: ['Reason'] },
];

function normalizeText(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeComparableValue(field: ComparableField, value: string): string {
  const normalized = normalizeText(value);
  if ((field === 'foreman' || field === 'inspector') && /^(?:—|–|-)$/.test(normalized)) return '';
  if (field === 'inUseLabel') {
    const withoutBadge = normalizeText(normalized.replace(/⚠\s*Stale/gi, ''));
    return /key on/i.test(withoutBadge) ? 'Yes' : withoutBadge;
  }
  return normalized;
}

function formatDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function readCellValue(cell: Cell): string {
  const value: CellValue = cell.value;
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return formatDate(value);
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return normalizeText(String(value));
  }
  if ('result' in value && value.result !== undefined) {
    const result = value.result;
    if (result instanceof Date) return formatDate(result);
    if (typeof result === 'string' || typeof result === 'number' || typeof result === 'boolean') {
      return normalizeText(String(result));
    }
    if (result && typeof result === 'object' && 'error' in result) return normalizeText(result.error);
    return '';
  }
  if ('richText' in value) return normalizeText(value.richText.map((part) => part.text).join(''));
  if ('text' in value) return normalizeText(value.text);
  if ('error' in value) return normalizeText(value.error);
  return normalizeText(cell.text);
}

function decodeText(buffer: Buffer): string {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.subarray(2).toString('utf16le');
  return buffer.toString('utf8').replace(/^\uFEFF/, '');
}

function parseDelimited(source: string): string[][] {
  const firstLine = source.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = (firstLine.match(/\t/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      row.push(normalizeText(value));
      value = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      row.push(normalizeText(value));
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      value = '';
    } else {
      value += character;
    }
  }
  row.push(normalizeText(value));
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  return rows;
}

function decodeHtml(value: string): string {
  return normalizeText(
    value
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
  );
}

function parseHtmlTable(source: string): string[][] {
  return [...source.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((rowMatch) =>
      [...(rowMatch[1] ?? '').matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cellMatch) =>
        decodeHtml(cellMatch[1] ?? '')
      )
    )
    .filter((row) => row.some((cell) => cell.length > 0));
}

async function loadRows(buffer: Buffer, fileName: string): Promise<string[][]> {
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Uint8Array.from(buffer).buffer);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) throw new Error('The downloaded Excel workbook does not contain a worksheet.');
    const rows: string[][] = [];
    worksheet.eachRow({ includeEmpty: true }, (row) => {
      const values: string[] = [];
      for (let column = 1; column <= worksheet.columnCount; column += 1) {
        values.push(readCellValue(row.getCell(column)));
      }
      if (values.some((value) => value.length > 0)) rows.push(values);
    });
    return rows;
  }

  const source = decodeText(buffer).trim();
  if (/^\s*<(?:!doctype\s+html|html|table)\b/i.test(source)) return parseHtmlTable(source);
  if (source.length > 0 && !source.includes('\u0000')) return parseDelimited(source);
  const signature = buffer.subarray(0, 8).toString('hex');
  throw new Error(`Unsupported Equipment Report download format (${fileName}, signature ${signature}).`);
}

export async function validateEquipmentExcel(
  buffer: Buffer,
  uiRows: readonly EquipmentReportRecord[],
  fileName: string
): Promise<EquipmentExcelValidationArtifact> {
  const rows = await loadRows(buffer, fileName);
  const headerRowIndex = rows.slice(0, 10).findIndex((row) => {
    const headers = row.map((value) => value.toLowerCase());
    return ['job', 'foreman', 'equipment'].every((header) => headers.includes(header));
  });
  if (headerRowIndex < 0) {
    throw new Error(`Excel header row was not found in ${fileName}. Expected Job, Foreman, and Equipment columns.`);
  }

  const headers = rows[headerRowIndex]?.map((value) => value.toLowerCase()) ?? [];
  const columnIndexes = new Map<ComparableField, number>();
  for (const column of columns) {
    const index = headers.findIndex((header) => column.headers.some((candidate) => candidate.toLowerCase() === header));
    if (index < 0) throw new Error(`Excel column was not found in ${fileName}: ${column.headers.join(' or ')}`);
    columnIndexes.set(column.key, index);
  }

  const excelRows = rows
    .slice(headerRowIndex + 1)
    .filter((row) =>
      columns.some((column) => normalizeText(row[columnIndexes.get(column.key) ?? -1] ?? '').length > 0)
    );
  const mismatches: EquipmentExcelMismatch[] = [];
  const rowCount = Math.max(uiRows.length, excelRows.length);
  for (let index = 0; index < rowCount; index += 1) {
    const uiRow = uiRows[index];
    const excelRow = excelRows[index];
    for (const column of columns) {
      const uiValue = normalizeComparableValue(column.key, uiRow ? String(uiRow[column.key]) : '');
      const excelValue = normalizeComparableValue(column.key, excelRow?.[columnIndexes.get(column.key) ?? -1] ?? '');
      if (uiValue !== excelValue) {
        mismatches.push({ row: index + 1, column: column.key, uiValue, excelValue });
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    uiRowCount: uiRows.length,
    excelRowCount: excelRows.length,
    mismatchCount: mismatches.length,
    mismatches,
  };
}
