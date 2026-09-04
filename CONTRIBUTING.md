# Contributing

This document describes the process of contributing to this project. It is
intended for anyone considering opening an issue or pull request.

## AI Assistance

> [!IMPORTANT]
>
> If you are using **any kind of AI assistance** to contribute to this project,
> it must be disclosed in the pull request.

If you are using any kind of AI assistance while contributing to this project,
**this must be disclosed in the pull request**, along with the extent to which
AI assistance was used. Trivial tab-completion doesn't need to be disclosed, as
long as it is limited to single keywords or short phrases.

An example disclosure:

> This PR was written primarily by Claude Code.

Or a more detailed disclosure:

> I consulted ChatGPT to understand the codebase but the solution was fully
> authored manually by myself.

## Quick start

If you'd like to contribute, report a bug, suggest a feature or you've
implemented a feature you should open an issue or pull request.

Any contribution to the project is expected to contain code that is formatted,
linted and that the existing tests still pass. Adding unit tests for new code is
also welcome.

> [!TIP]
> If you (or an AI agent) are about to make a non-trivial change, read
> [`AGENTS.md`](AGENTS.md) first. It documents project-specific conventions,
> the three signing paths, unit handling, pinned dependencies, and common
> gotchas. The behavioral spec for each command is in
> [`docs/COMMANDS.md`](docs/COMMANDS.md).

## Dev environment

- [Node.js](https://nodejs.org/) >= 24.0.0
- [pnpm](https://pnpm.io/)

```bash
git clone https://github.com/flare-foundation/flare-stake-tool.git
cd flare-stake-tool
pnpm install
```

To compile TypeScript:

```bash
pnpm build
```

## Linting and formatting

This project uses [ESLint](https://eslint.org/) and [Prettier](https://prettier.io/)
with the [Flare shared configurations](https://github.com/flare-foundation/flare-handbook).

Lint all source files:

```bash
pnpm lint:check
```

Lint and auto-fix:

```bash
pnpm lint:fix
```

Check formatting:

```bash
pnpm format:check
```

Format all source files:

```bash
pnpm format:fix
```

## Testing

Run the test suite:

```bash
pnpm test
```

Run with coverage report:

```bash
pnpm test:coverage
```

### Integration tests

Integration tests spin up a local Flare network via docker-compose
and exercise the CLI against real validators. They require Docker.

```bash
pnpm test:integration
```

> [!NOTE]
> Integration tests are run locally only, not in CI. GitLab's shared
> runners use docker-in-docker, where docker-compose volume mounts
> (`./local:/app/...`) don't work because the docker daemon doesn't see
> the runner's filesystem. Run them on your machine before opening an
> MR for any change touching signing or RPC logic.

## Release process

Development happens on GitLab, which mirrors to the public GitHub repo
([flare-foundation/flare-stake-tool](https://github.com/flare-foundation/flare-stake-tool)).
Releases are published to npm from the GitHub mirror: pushing a semver git tag
(e.g. `v4.2.3`) triggers [`.github/workflows/release.yaml`](.github/workflows/release.yaml),
which runs the test suite, verifies the build, and publishes to the npm
registry via [`flare-foundation/npm-release-action`](https://github.com/flare-foundation/npm-release-action)
using OIDC trusted publishing and npm provenance attestation. The action
enforces that the tag matches `package.json`'s version and picks the `latest`
or `beta` dist-tag based on whether the tag is stable (`vX.Y.Z`) or a
prerelease (`vX.Y.Z-rc.N` / `-alpha.N`).
