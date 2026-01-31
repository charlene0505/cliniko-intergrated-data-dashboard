const BASE_URL = `https://api.${process.env.CLINIKO_SHARD}.cliniko.com/v1`;

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function clinikoFetch(endpoint: string, retries = 3): Promise<unknown> {
  let attempt = 0;

  while (attempt < retries) {
    try {
      const res = await fetch(`${BASE_URL}${endpoint}`, {
        headers: {
          Authorization: `Basic ${Buffer.from(process.env.CLINIKO_API_KEY + ":").toString("base64")}`,
          Accept: "application/json",
          "User-Agent": "charlene(charleneliu03@163.com)",
        },
      });

      // Handle rate limiting - wait and retry (doesn't count as an attempt)
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get("Retry-After") || "2", 10);
        console.log(`Rate limited, waiting ${retryAfter}s...`);
        await sleep(retryAfter * 1000);
        continue;
      }

      // Check for other errors
      if (!res.ok) {
        const text = await res.text();

        // Don't retry on 4xx client errors (except 429 rate limiting which is handled above)
        // These are permanent failures - retrying won't help
        if (res.status >= 400 && res.status < 500) {
          const error = new Error(`Cliniko API error ${res.status}: ${text.substring(0, 200)}`);
          (error as Error & { noRetry: boolean }).noRetry = true;
          throw error;
        }

        // For 5xx server errors, let the retry logic handle it
        throw new Error(`Cliniko API error ${res.status}: ${text.substring(0, 200)}`);
      }

      // Parse JSON safely
      const text = await res.text();
      if (!text || text.trim() === "") {
        throw new Error("Empty response from Cliniko API");
      }

      return JSON.parse(text);
    } catch (error) {
      // Don't retry errors marked as non-retryable (4xx client errors)
      if ((error as Error & { noRetry?: boolean }).noRetry) {
        throw error;
      }

      attempt++;

      // On last attempt, throw the error
      if (attempt >= retries) {
        throw error;
      }
      // Wait before retrying (exponential backoff)
      const waitTime = Math.pow(2, attempt) * 500;
      console.log(`Fetch failed, retrying in ${waitTime}ms (attempt ${attempt}/${retries}):`, error);
      await sleep(waitTime);
    }
  }

  throw new Error("Max retries exceeded");
}
