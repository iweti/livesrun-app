# LivesRun App

- This repository contains the Expo frontend for Android, iOS, and web. Use Node 26 and the committed npm lockfile.
- `npm run dev` starts the web interface with synthetic in-memory data. Keep API integration disabled by default. Do not provision or connect external services without explicit authorization.
- Run `npm run typecheck`, `npm test`, `npm run build` and `npm run format:check` after meaningful changes.
- Use `cd apps/mobile && npx expo export --platform all` to check native bundles. GPS and SQLCipher still require testing on physical devices.
- Keep activities private by default. Never expose route coordinates in social responses, logs, or telemetry.
- Never commit secrets. Preserve the IWETI footer and link to https://iweti.com.
- The API and the beta checklist live in https://github.com/iweti/livesrun-api.
