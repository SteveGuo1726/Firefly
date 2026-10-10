# Firefly cloud Sandbox development

Firefly continues using Astro, Svelte, pnpm and the ai/preview-test GitHub branch. Production remains on its existing deployment platforms.

## Development environment

- Named Sandbox: firefly-dev-ai
- Vercel project: firefly-ai-browser-tests
- Project ID: prj_hycKjh04rKosxTIQ4WHPwpd2nXOv
- Source checkout: /vercel/Firefly
- HTTPS preview: https://sb-6kuax07bfhra.vercel.run/
- Exposed port: 4321
- Compute: 2 vCPU, 4 GiB RAM, Hobby session timeout 15 minutes
- Persistent snapshot: keeps only the latest snapshot for up to seven days
- Sandbox public demo requires no password and has no write authority; Cloudflare preview editing password is server-side only

## ChatGPT resume procedure

1. Use Vercel get_named_sandbox with the project ID, name firefly-dev-ai and resume=true.
2. Use the returned current session ID, never a previous stopped session.
3. Start an asynchronous command: bash /vercel/Firefly/scripts/sandbox-dev.sh with cwd /vercel/Firefly.
4. Check the HTTPS preview until the page returns HTTP 200 and the vite-hmr WebSocket connects.
5. Edit the existing source files in the active Vercel Sandbox session; HMR updates the page without pnpm build or deployment.
6. Run targeted tests, commit changes only to ai/preview-test and verify the Sandbox worktree is synchronized.
7. Stop the Sandbox when the development session is finished to conserve free allowances.

The boot script refuses the wrong Git branch, a non-preview gallery API or an unset Sandbox host. It reuses node_modules after restoration and installs from the lockfile only if dependencies are missing.

## Boundaries

Snapshots retain files and dependencies, but do not retain server processes. A stopped sandbox cannot be woken by visiting the HTTPS URL alone; ChatGPT must resume and start the boot command.

The dev server is accessible through a public URL: never inject production GitHub, KV, image-bed, comment or OAuth credentials. The admin demo is read-only and real management APIs still enforce authentication. Cloudflare Workers/KV changes require a separate preview-only integration deployment; ordinary Astro and Svelte edits use HMR.
