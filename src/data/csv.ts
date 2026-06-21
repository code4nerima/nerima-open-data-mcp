import { parse } from "csv-parse/sync";
import iconv from "iconv-lite";

export function decodeCsvBuffer(buffer: Buffer): string {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString("utf8");
  }

  const utf8 = buffer.toString("utf8");
  const replacementCount = (utf8.match(/\uFFFD/g) ?? []).length;
  if (replacementCount === 0) {
    return utf8;
  }

  return iconv.decode(buffer, "Shift_JIS");
}

export function parseCsvRows(csvText: string): Record<string, string>[] {
  return parse(csvText, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true
  }) as Record<string, string>[];
}
