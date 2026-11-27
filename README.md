# @kmerhosting/sdk

```bash
npm install @kmerhosting/sdk
```

```ts
import { KmerHostingClient } from "@kmerhosting/sdk";

const client = new KmerHostingClient({ apiKey: process.env.KMERHOSTING_API_KEY });
const domains = await client.domains.list();
```

Check domain availability and price (public, no API key used, up to 20 domains, 20 searches per minute per IP):

```ts
const { results } = await client.domains.search(["example.com", "example.cm"]);
```

## Retries and rate limits

Requests that fail with `429`, `502`, `503` or `504` are retried automatically (3 attempts in total) with exponential backoff and jitter. `Retry-After` is honored, and a write keeps the **same** `Idempotency-Key` on every attempt. When attempts run out on a 429 the client throws `RateLimitError` (a subclass of `KmerHostingError`):

```ts
import { KmerHostingClient, RateLimitError } from "@kmerhosting/sdk";

try {
  await client.services.list();
} catch (error) {
  if (error instanceof RateLimitError) console.log(`retry in ${error.retryAfter}s`);
}

new KmerHostingClient({ retry: { maxAttempts: 5, baseDelayMs: 250 } }); // tune
new KmerHostingClient({ retry: false });                                 // disable
```

Use only in a trusted server runtime. The SDK never stores a key.

Source: https://github.com/KmerHosting/typescript-sdk
API documentation: https://api.kmerhosting.com/docs

License: Apache-2.0.
