import { parse } from "csv-parse/sync";
import { parse as parseStream } from "csv-parse";
import iconv from "iconv-lite";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

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

function decodeChunk(buffer: Buffer, encoding: "utf8" | "Shift_JIS"): string {
  return encoding === "Shift_JIS" ? iconv.decode(buffer, "Shift_JIS") : buffer.toString("utf8");
}

function detectEncoding(buffer: Buffer): "utf8" | "Shift_JIS" {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return "utf8";
  }

  const utf8 = buffer.toString("utf8");
  const replacementCount = (utf8.match(/\uFFFD/g) ?? []).length;
  return replacementCount === 0 ? "utf8" : "Shift_JIS";
}

export async function parseCsvRowsFromStream(
  stream: NodeJS.ReadableStream,
  onRow: (row: Record<string, string>) => Promise<void>
): Promise<void> {
  let encoding: "utf8" | "Shift_JIS" | null = null;
  let carry = Buffer.alloc(0);

  const decoder = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      try {
        if (!encoding) {
          const combined = Buffer.concat([carry, chunk]);
          if (combined.length < 4096) {
            carry = combined;
            callback();
            return;
          }
          encoding = detectEncoding(combined);
          const content =
            encoding === "utf8" && combined.length >= 3 && combined[0] === 0xef && combined[1] === 0xbb && combined[2] === 0xbf
              ? combined.subarray(3)
              : combined;
          this.push(decodeChunk(content, encoding));
          carry = Buffer.alloc(0);
          callback();
          return;
        }

        this.push(decodeChunk(chunk, encoding));
        callback();
      } catch (error) {
        callback(error as Error);
      }
    },
    flush(callback) {
      try {
        if (carry.length > 0) {
          const detected = encoding ?? detectEncoding(carry);
          const content =
            detected === "utf8" && carry.length >= 3 && carry[0] === 0xef && carry[1] === 0xbb && carry[2] === 0xbf
              ? carry.subarray(3)
              : carry;
          this.push(decodeChunk(content, detected));
        }
        callback();
      } catch (error) {
        callback(error as Error);
      }
    }
  });

  const parser = parseStream({
    columns: true,
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true
  });

  parser.on("data", (row: Record<string, string>) => {
    parser.pause();
    onRow(row)
      .then(() => parser.resume())
      .catch((error) => parser.destroy(error));
  });

  await pipeline(stream, decoder, parser);
}
