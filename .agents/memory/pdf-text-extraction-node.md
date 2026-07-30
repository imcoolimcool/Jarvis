---
name: PDF text extraction in Node.js
description: Extracting text from PDFs in the Express backend without runtime errors.
---

## Rule

When extracting text from PDFs in a Node.js server, use `pdf-parse` v2 via the named `PDFParse` class and install `@napi-rs/canvas` as a peer dependency.

**Why:** `pdf-parse` v2 is not the same as the old `pdf-parse` v1. It is built on `pdfjs-dist` and needs a Node canvas implementation for `DOMMatrix` and related APIs. Without `@napi-rs/canvas`, the server crashes at startup with `DOMMatrix is not defined`.

**How to apply:**

```typescript
import { PDFParse } from "pdf-parse";

const parser = new PDFParse({ data: buffer });
const parsed = await parser.getText();
await parser.destroy();
const text = parsed.text;
```

Install both packages:

```bash
pnpm add pdf-parse @napi-rs/canvas
```

Also import `mammoth` as a named export: `import { extractRawText } from "mammoth";`.