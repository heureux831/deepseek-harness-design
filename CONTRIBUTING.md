# Contributing

Bug reports, documentation improvements, and pull requests are welcome. This is a community DeepSeek Harness plugin.

## Set up

Use Node.js 22.12 or later in the 22.x series, or Node.js 24 or later (required by the development test dependencies):

```sh
npm ci
npm test
npm run check
```

## Project layout

| Path | Responsibility |
| --- | --- |
| `host/index.js` | Model tools, HTTP routes, session state, and lifecycle. |
| `host/persistence.js` | Storage schema and size limits. |
| `client.js` | Design sidebar, iframe preview, and selection handling. |
| `cordis.patch.yml` | Host plugin registration in the Harness bundle. |
| `locale/` | Plugin Manager descriptions. |
| `tests/` | Host service tests and real React lifecycle tests in JSDOM, with controlled network responses. |
| `scripts/release.mjs` | Release locking, version guard, frozen packaging, and build manifest. |
| `e2e/` | Browser tests, test-only seed plugin, and native Harness storage / sandbox tests. |

## Make a change

1. Create a branch from `main`.
2. Keep the change focused and explain the user-visible behavior.
3. Add regression coverage for bugs or behavior changes. Documentation-only changes do not need new tests.
4. Run `npm test` and `npm run check`. For panel, routing, packaging, or storage integration changes, follow [e2e/README.md](e2e/README.md).
5. Update both README files when installation, behavior, limits, or compatibility changes. Add a changelog entry.
6. Open a pull request describing the change and the checks actually run.

Use public Harness service contracts. Keep session state isolated, persist before exposing a successful edit, and preserve storage compatibility. Keep display `title` separate from stable `name` / `slug`. Titles are optional in stored rows for compatibility; renaming must preserve history, file paths, prototype state, and element bindings. Production code must not register the E2E seed route or enable same-origin access for the preview iframe.

Do not commit generated HTML, Harness profiles, screenshots, logs, API keys, launch tokens, or tarballs. Redact session content and credentials from bug reports. See [SECURITY.md](SECURITY.md) for sensitive reports.

## Build and release

```sh
./release.sh
```

This creates a new `dist/rN` snapshot, a standard npm tarball, and an external `BUILD.json` with artifact and file hashes. A completed version cannot be built again in the same output directory, even when the requested `rN` differs. Reuse a verified tarball for repeated installs. Changed distributable bytes require a new version, including when building on another machine or with another `DSG_RELEASE_DIR`.

Commit the final source before building a release so `BUILD.json` identifies a clean source commit. Tests run before packaging, release inputs are checked for changes, and npm packs the frozen snapshot. Failed builds leave no completed snapshot. A concurrent build owns `.release-lock`; after a crash, remove that lock only after verifying no builder is running. Install the tarball into an isolated Harness profile and run the integration checks before distributing it.

The CLI supports symbolic link paths. Finder metadata and the documented local build noise are excluded before copying and hashing; other hidden resources remain verified. If npm omits a required file, the error lists its path. Release tests include real subprocess builds and npm tarball checks, using isolated caches and temporary source trees.

For a release, update `package.json`, `package-lock.json`, the changelog, and versioned examples in both README files and E2E documentation. Keep `deepseek-harness-design` as the package name; keep the `designer` storage domain and `.dsh-design` export path stable.

The GitHub CI runs Host, React, and release tests, syntax checks, and the release script on Node.js 22 and 24. It does not run macOS browser tests or publish to npm. The maintainer may publish a verified tarball with `npm publish <tarball>` after confirming registry ownership and the release version. Never put registry credentials in the repository.

## License

Contributions are provided under this project's [MIT license](LICENSE).
