# Package selection and upgrades

## Select before installing

- Read the selected app's direct dependencies and lockfile first. Preserve existing versions unless
  installation or upgrade is within the user's requested scope; use its existing package manager.
- New stable integrations target the published 1.x line (`@^1.0.0` in the public examples). Before
  installing, query the required package's registry version; repository config or documentation is
  not proof that 1.0.0 was published. Never remove the selector and fall back to an old alpha on latest.
- If no stable version exists, report that fact. Use `@alpha` only when the user chooses prerelease
  use or has already authorized it; do not silently change release channels.
- The first stable release targets 1.0.0 for all public packages; later releases version independently. Install only the app's direct
  requirements; do not align all package numbers or add transitive Core/Analyzer dependencies.
- Keep exact internal dependencies as published. Do not override them to force version equality.

## Verify upgrades

Check the selected package's release notes and peer requirements, update only authorized direct
dependencies and the lockfile, then run the app's type check, lint, relevant tests and full Build.
Verify Runtime language switching and already configured optional features. Report installed package
versions and any missing scan/MCP capability instead of editing node_modules.

Codex plugin updates and app npm dependency updates are separate. Do not infer permission to upgrade
the app from a plugin update, and do not assume identical version numbers are required for compatibility.
