# Changelog

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
