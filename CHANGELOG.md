# Changelog

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
