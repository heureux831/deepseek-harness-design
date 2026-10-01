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
| `e2e/` | Browser tests, test-only seed plugin, and native Harness storage / sandbox tests. |

## Make a change

1. Create a branch from `main`.
2. Keep the change focused and explain the user-visible behavior.
3. Add regression coverage for bugs or behavior changes. Documentation-only changes do not need new tests.
4. Run `npm test` and `npm run check`. For panel, routing, packaging, or storage integration changes, follow [e2e/README.md](e2e/README.md).
5. Update both README files when installation, behavior, limits, or compatibility changes. Add a changelog entry.
6. Open a pull request describing the change and the checks actually run.

Use public Harness service contracts. Keep session state isolated, persist before exposing a successful edit, and preserve storage compatibility. Production code must not register the E2E seed route or enable same-origin access for the preview iframe.

Do not commit generated HTML, Harness profiles, screenshots, logs, API keys, launch tokens, or tarballs. Redact session content and credentials from bug reports. See [SECURITY.md](SECURITY.md) for sensitive reports.

## Build and release

```sh
./release.sh
```

This creates a new `dist/rN` snapshot and a standard npm tarball. Install that tarball into an isolated Harness profile and run the integration checks before distributing it.

For a release, update `package.json`, `package-lock.json`, the changelog, and versioned examples in both README files and E2E documentation. Keep `deepseek-harness-design` as the package name; keep the `designer` storage domain and `.dsh-design` export path stable.

The GitHub CI runs Host and React tests, syntax checks, and packaging on Node.js 22 and 24. It does not run macOS browser tests or publish to npm. The maintainer may publish a verified tarball with `npm publish <tarball>` after confirming registry ownership and the release version. Never put registry credentials in the repository.

## License

Contributions are provided under this project's [MIT license](LICENSE).
