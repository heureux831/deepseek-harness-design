# Changelog

## 0.5.4 — Release identity

- Give the finalized 0.5.3 r6 implementation a distinct release version. Host and browser behavior are unchanged from r6; the earlier local r5 build shared 0.5.3 but lacked the historical-click revision check.
- Refuse another completed build of the same package version within the selected release output directory. Reuse the existing artifact or bump the version.
- Serialize release builds, remove failed staging directories, and verify lockfile versions.
- Verify stable release inputs and pack the frozen snapshot, so tarball files match the checked source and install snapshot.
- Add `BUILD.json` beside the tarball with its SHA-256, packaged file hashes, source commit, and dirty state. It is excluded from the npm package.
- Exercise the release script in CI and add regressions for version reuse, changing inputs, concurrency, failed installs, and package contents.

## 0.5.3 — State transitions and boundary handling

- Retry failed document and revision loads, check HTTP status, and distinguish loading errors from an empty session.
- Ignore late responses after switching sessions, alternatives, revisions, or selected elements.
- Reset historical revisions when switching alternatives; fall back to the latest revision when old history is evicted. Wait for both chains before selecting comparison revisions.
- Apply actual 390 / 834 / 1280 px viewport widths in single and comparison views, with horizontal scrolling in narrow sidebars.
- Preserve the Host's inspect mode when reopening Design and restore retained selection receipts, including historical revision context. Switching inspect mode preserves prototype state.
- Report and retry inspect / clear synchronization failures. Reject stale selection actions and clicks from an outdated preview or inspect mode.
- Reconcile expired and delivered selections, clear bindings on preview changes and successful edits, and direct unnamed edits to the selected alternative.
- Treat intentionally empty HTML as a saved document; return explicit missing-revision results. Resolve timestamp ties for deterministic default alternatives.
- Identify invalid legacy import files and retain atomic import behavior. Add real React lifecycle tests and regression coverage for history, branch, and HTML limits.

## 0.5.2 — Design welcome guide

- Replace the empty Design panel with a step-by-step usage guide and example prompts.
- Explain element selection, alternatives, revisions, viewport sizes, comparison, and interacting with the prototype.
- Show the guide before the first draft and replace it with the live preview when a design becomes available.

## 0.5.1 — Workspace export policy fix

- Pass the owning session's resolved sandbox policy to HTML exports, matching the native fs tool call contract. Version 0.5.0 omitted this argument and used the deployment fallback root, so exports could fail even inside the session workspace.
- Preserve session read-only mode, workspace containment, and symlink checks without requesting wider access.
- Forward workspace resolution and cancellation to exports and legacy import reads.
- Add a regression using the shipped Harness policy, projection, storage, and sandboxed filesystem services outside temporary roots. Previous temporary-directory checks concealed the failure because temporary roots are writable in workspace-write mode.
- Keep Harness drafts durable when an optional HTML export is denied. Legacy import reads are not blocked by the mutation-only sandbox fence.

## 0.5.0 — Initial public source release

- Adopt the package name `deepseek-harness-design` to avoid existing npm package names.
- Add a live HTML Design sidebar, element selection, viewport controls, alternatives, revision history, and comparison.
- Persist drafts and revision history in the Harness storage domain, restore after restart, and roll back failed writes.
- Serialize concurrent edits and import legacy session-hashed HTML exports.
- Scope selection and inspect state to each session; enforce selection expiry and context delivery tracking.
- Sandbox previews and reject simple cross-origin POST bodies that could forge selection state.
- Keep destructive test seeding outside the production package.
- Add bilingual documentation, MIT licensing, contribution guidance, CI, and regression tooling.

This source release does not imply npm publication. Compatibility was verified with Harness Desktop 0.2.0-rc.2 using its Web profile.
