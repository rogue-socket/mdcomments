# Development, Packaging, and Publishing

This document contains setup and release instructions that are intentionally kept out of the product-facing README

## Local development setup

1. Install dependencies

```bash
npm install
```

2. Compile TypeScript

```bash
npm run compile
```

3. Open this workspace in VS Code and press `F5` to launch the Extension Development Host

## Validation commands

```bash
npm run compile
npm run test:unit
npm run check
```

## Packaging

Create a `.vsix` package artifact:

```bash
npm run package
```

Install the generated VSIX in VS Code using:

- Extensions: Install from VSIX...

## Publishing to Marketplace

1. Ensure `publisher` in `package.json` is your Marketplace publisher
2. Ensure a valid PAT is available as `VSCE_PAT` (or interactive login is configured)
3. Run:

```bash
npm run publish
```

## Release playbook

1. Update `CHANGELOG.md` with user-facing release notes
2. Bump `version` in `package.json`
3. Run full validation

```bash
npm run check
```

4. Build release artifact

```bash
npm run package
```

5. Publish

```bash
npm run publish
```

6. Verify published extension metadata

```bash
npx --yes @vscode/vsce@3.8.0 show rogue-socket.commentonmd
```

7. Commit release metadata and tag

```bash
git add package.json CHANGELOG.md
git commit -m "release: vX.Y.Z"
git tag vX.Y.Z
git push && git push --tags
```
