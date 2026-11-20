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

Use only in a trusted server runtime. The SDK never stores a key.

Source: https://github.com/KmerHosting/typescript-sdk
API documentation: https://api.kmerhosting.com/docs

License: Apache-2.0.
