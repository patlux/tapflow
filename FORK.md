# patlux fork of tapflow

This fork is used as a central web dashboard for the iOS simulators and Android emulators on
several of our own Macs. Upstream tapflow is built for build QA. A device view there always starts
from an uploaded build, and leaving the view shuts the device down. That does not fit devices that
people also use for development, so this fork changes the device lifecycle in three places and adds
one relay setting.

Upstream: <https://github.com/jo-duchan/tapflow>, remote `upstream` (push disabled locally).
Base: upstream `main` at `5ccc6c49` (2026-10-27), 21 commits after `v0.29.0`.

## Changes

Every changed place carries a `Fork (FORK.md)` comment, so `rg "Fork \(FORK.md\)"` lists them all.

1. **Leaving a device keeps it running.**
   - `packages/dashboard/hooks/useAgentSession.ts`: the back links, the Mac list and the page
     unmount send `session:leave` instead of `device:shutdown`. The relay already treats a leave as
     "keep the device up", which is what a CI run leaving does.
   - `packages/relay/src/RelayServer.ts`: when a browser socket of a `dashboard` holder closes (tab
     closed, network gone), the relay no longer starts the idle countdown (`IDLE_TIMEOUT_MS`) that
     shut the device down. Holders of every other kind (`mcp`, `flow-runner`, or no declared kind)
     keep the countdown, because the relay counts and reclaims the devices automation starts.
2. **A device is stopped on purpose.** The device toolbar has a "Shut down the device" control at
   the end of the Device group, after the restart, behind a confirmation
   (`components/device/shared/SimulatorToolbar.tsx`). It sends `device:shutdown` and returns to the
   device list of the same Mac.
3. **Devices page without a build.** `/devices` (sidebar entry "Devices") renders the QA session
   page without a build. `?platform=android` or the iOS/Android tabs choose the platform, which a
   build decides on the build page. The page has its own breadcrumb, starting at "Devices". It
   offers no "Full reset", because without a build under test that erase only wipes a device that
   somebody may be working on.

4. **The relay can listen on one address.** `local.host` in `tapflow.config.json`, or
   `TAPFLOW_HOST`, binds the relay port to that address only, for example a tailnet address. Unset, it
   binds every interface as upstream does. It applies to `tapflow relay start` and to the container
   entry point (`packages/relay/src/server.ts`), not to `tapflow start`, whose local agent connects to
   `localhost`. A relay bound to another address has no loopback listener, so the browser setup page,
   which answers loopback only, is not reachable; create the first account with
   `TAPFLOW_ADMIN_EMAIL` and `TAPFLOW_ADMIN_PASSWORD` instead.

No protocol message, database schema or CLI flag changed. The only new configuration key is the
optional `local.host`.

## Repository tooling

- `lefthook.yml` runs lint and typecheck before a commit. The upstream `a11y-lens` job is removed:
  it sends the staged files to `claude -p`, `codex exec` or `cursor-agent -p`, and this fork is
  worked on with pi. UI changes are reviewed by hand against the `core` rules in
  `node_modules/@a11y-lens/cli/skills/a11y-lens/references/` (see `packages/dashboard/AGENTS.md`).
- The upstream pre-push guard that refuses pushes of `main` is removed, because `main` is this
  fork's working branch.
- `.claude/` holds upstream's Claude Code hooks. They do nothing for pi and are left as they are.

## Known limits

- A device that keeps running keeps its agent capture running. The agents send frames when the
  screen changes, so an idle screen should cost little. This is not measured yet.
- Running devices hold their memory. Shut down what is not needed, or the agent's admission
  checks refuse new sessions on that Mac.
- The upstream docs under `docs/` and the `AGENTS.md` files still describe the upstream lifecycle.
  This file describes the fork. Comments in upstream files that name "three id-less
  `device:shutdown`s on the way out of a view" (`useDeviceReboot.ts`, `inboundDisposition.ts`,
  `RelayServer.ts` and their tests) now mean the one id-less shutdown the toolbar control sends.
  The behaviour they describe still holds; they are left unchanged to keep upstream merges small.

## Tests

Regression tests for the changes:

- `packages/relay/src/__tests__/dashboardLeaveKeepsDevice.test.ts`
- `packages/dashboard/src/__tests__/useQASessionHooks.test.tsx` and
  `useAgentSession.unmount.test.tsx` (leave instead of shutdown, `shutdownDevice`)
- `packages/dashboard/src/__tests__/SimulatorToolbar.shutdown.test.tsx`
- `packages/dashboard/src/__tests__/QASession.devices.test.tsx`
- `packages/dashboard/src/__tests__/sidebarDevices.test.tsx`
- `packages/relay/src/__tests__/listenHost.test.ts`

Run them as the repository requires, for example `pnpm --filter @tapflowio/dashboard test` and
`pnpm --filter @tapflowio/relay test`. Never run `npx vitest`.

Environment notes for a workstation:

- `pnpm test:scripts` creates throwaway Git repositories. With global commit signing
  (`commit.gpgsign=true`) their commits wait for the signer and the run times out. Run the suite
  with `GIT_CONFIG_GLOBAL=/dev/null` to test without the global Git configuration.
- `scripts/__tests__/testsReadSource.test.mjs` needs `pnpm build` first.
- `packages/relay/src/__tests__/runVideos.test.ts` answers `507` when the disk has less than 10 %
  free space, because the relay keeps that space for itself.

## Updating from upstream

```bash
git fetch upstream
git merge upstream/main
rg "Fork \(FORK.md\)"          # every changed place is still there
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck
pnpm --filter @tapflowio/relay test
pnpm --filter @tapflowio/dashboard test
```

Use a merge rather than a rebase, so the published history of this fork is never rewritten.
