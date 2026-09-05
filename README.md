# Firefly Friend Circle Data

This branch is a static publish bundle for Firefly friend circle data.

- `all.json`: standard JSON payload
- `all.js`: browser-friendly payload without CORS dependency
- `index.html`: simple status page
- `package.json` + `build.mjs`: optional no-dependency build entry for Pages platforms

Recommended:

1. Static direct deploy: publish repository root
2. Build deploy: run `pnpm run build`, output directory `dist`
