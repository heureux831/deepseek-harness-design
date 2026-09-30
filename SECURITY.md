# Security

## Reporting a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/heureux831/deepseek-harness-design/security/advisories/new) for vulnerabilities. Do not include credentials, private prototype HTML, session data, or launch tokens in public issues.

If private reporting is unavailable, open an issue asking the maintainer to enable it without disclosing exploit details.

## Scope and deployment

Only the current release is maintained. This plugin is intended for a local Harness instance bound to `127.0.0.1`; it does not add an authentication layer. Network deployments must supply their own authentication and access control.

Generated HTML can run scripts inside an opaque-origin sandbox. The sandbox protects the parent application's same-origin context; it is not a guarantee that a prototype has no external network activity. Review generated HTML before using it with sensitive data.

Host tests cover preview boundaries, simple cross-origin mutation rejection, session isolation, and persistence rollback. Please include the Harness version, plugin version, reproduction steps, and expected impact in a private report.
