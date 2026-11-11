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

Reviewers and auditors: the security review scope (the TypeScript sources under
`src/`, without the tests and the build output) is in
[`SECURITY.md`](SECURITY.md#review-scope), as is how to report a vulnerability.

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

Integration tests exercise the CLI against a running Helicon-capable
localflare network started from the go-flare checkout
(`avalanchego/scripts/localflare.sh`). They need Node 24 and a built `dist/`.

```bash
pnpm build
pnpm test:integration
```

They expect the node at `http://localhost:9650`. For another node, give its base
URL both to the tests and to the CLI they run:
`LOCALFLARE_RPC_URL=<url> FLARE_RPC_URL=<url> pnpm test:integration`.

A skipped test fails the run: the stake tests skip when every node is already
validating, as on a rerun within 15 minutes. Wait for the validations to end, or
pass `--no-forbid-pending` to allow skips.

> [!NOTE]
> Integration tests are run locally only, not in CI, because they need a
> running node. Run them before opening an MR for any change touching signing
> or RPC logic. The offline characterization goldens (`pnpm test`) run in CI
> and catch most behaviour changes without a node; see AGENTS.md.

## Release process

Development happens on GitLab, which mirrors `main` and the version tags to the
public GitHub repo
([flare-foundation/flare-stake-tool](https://github.com/flare-foundation/flare-stake-tool)).
Releases are published to npm from the GitHub mirror, not from GitLab CI, which
only runs the checks on the tag. Pushing a semver git tag (e.g. `v5.0.0`)
triggers [`.github/workflows/release.yaml`](.github/workflows/release.yaml),
which:

1. builds, runs the tests (which need the build), and checks that `dist/run.js`
   ships in the `npm pack` tarball;
2. checks that the tag matches `package.json`'s `version`;
3. publishes via
   [`flare-foundation/npm-release-action`](https://github.com/flare-foundation/npm-release-action)
   with OIDC trusted publishing and npm provenance attestation (no credentials
   in the repository), under the dist-tag `latest` for a stable tag
   (`vX.Y.Z`) or `beta` for a prerelease (`vX.Y.Z-rc.N` / `-alpha.N`).

A release candidate is a prerelease of the next version: set `package.json` to
`X.Y.Z-rc.N` and tag `vX.Y.Z-rc.N`. `npx @flarenetwork/flare-stake-tool` keeps
installing `latest`; testers install `@flarenetwork/flare-stake-tool@X.Y.Z-rc.N`.
Release candidates have no CHANGELOG section of their own: the `X.Y.Z` section
collects their changes and gets its date at the final release.

The version changes only in the commit that prepares a release, a
`chore(release)` commit that also dates the CHANGELOG section of a final
release; merge requests in between don't touch it. Tag `main` once that commit
is merged.
