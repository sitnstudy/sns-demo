# SNS Demo

A self-contained, deterministic four-question Sit-N-Study demo. It presents
Level 1 variations of PSAT questions 1, 5, 6 and 13 using the existing Quode
question and teaching experience.

The generated question payloads and browser runtime are committed to this
repository. Production makes no API calls and requires no Python service.

## Develop

```bash
npm install
npm run dev
```

## Verify

```bash
npm run build
npx playwright install chromium
npm test
```

Pushes to `main` build and deploy the static `dist/` directory with GitHub
Pages. Configure `demo.sitnstudy.com` as the repository's Pages custom domain.
