# TubeGenius Pro

TubeGenius Pro is a local-first creator toolkit built with Vite, React, TypeScript, shadcn-ui, and Tailwind CSS.

## Local development

```sh
npm install
npm run dev
```

## Production build

```sh
npm run build
```

## Configuration

The application no longer depends on a hosted platform wrapper or generated backend triggers. API integrations are being migrated to a clean local service layer under `src/lib`.

Current user-provided API keys are stored by the app settings UI in browser localStorage:

- `gemini-api-key` for Google Gemini-powered generation.

Voice Studio uses Puter.js for browser-native text-to-speech and voice conversion without API keys.

See `docs/dependencies-audit.md` for the current migration audit and dependency map.
