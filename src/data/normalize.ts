const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "");
}

export function normalizeLimit(limit: unknown): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return DEFAULT_LIMIT;
  }

  return Math.min(Math.max(Math.trunc(limit), 0), MAX_LIMIT);
}

export function includesNormalized(value: unknown, query: unknown): boolean {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) {
    return true;
  }

  return normalizeText(value).includes(normalizedQuery);
}

export function anyFieldIncludes(values: unknown[], query: unknown): boolean {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) {
    return true;
  }

  return values.some((value) => normalizeText(value).includes(normalizedQuery));
}
