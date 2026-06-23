const USER_AGENT = "nerima-open-data-mcp/0.1.0 (+https://www.city.nerima.tokyo.jp/)";
const DEFAULT_RETRY_COUNT = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;

function retryCount(): number {
  const value = Number(process.env.FETCH_RETRY_COUNT);
  return Number.isInteger(value) && value >= 0 ? value : DEFAULT_RETRY_COUNT;
}

function retryDelayMs(): number {
  const value = Number(process.env.FETCH_RETRY_DELAY_MS);
  return Number.isInteger(value) && value >= 0 ? value : DEFAULT_RETRY_DELAY_MS;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorCode(error: unknown): string {
  const err = error as { code?: string; cause?: { code?: string } };
  return err.code ?? err.cause?.code ?? "";
}

function isRetryableFetchError(error: unknown): boolean {
  const message = errorMessage(error);
  const code = errorCode(error);

  return (
    code === "UND_ERR_SOCKET" ||
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "EAI_AGAIN" ||
    message.includes("fetch failed") ||
    message.includes("other side closed")
  );
}

function isRetryableResponse(response: Response): boolean {
  return response.status === 408 || response.status === 429 || response.status >= 500;
}

export async function fetchOfficial(url: string): Promise<Response> {
  const retries = retryCount();
  const baseDelayMs = retryDelayMs();
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0 && baseDelayMs > 0) {
      await delay(baseDelayMs * attempt);
    }

    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": USER_AGENT
        }
      });

      if (isRetryableResponse(response) && attempt < retries) {
        console.warn(`Retrying fetch ${url}: ${response.status} ${response.statusText}`);
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;
      if (!isRetryableFetchError(error) || attempt >= retries) {
        throw error;
      }
      console.warn(`Retrying fetch ${url}: ${errorMessage(error)}`);
    }
  }

  throw lastError;
}
