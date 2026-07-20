# AGENTS.md

Instructions for AI coding agents (Claude Code, Copilot, Cursor, etc.) working in this repository.

## What this project is

A JSDoc plugin (`convert-brighterscript-docs.js`) that rewrites BrightScript/BrighterScript
source into JSDoc-compatible pseudo-JS before JSDoc parses it, so BrightScriptDoc-style comments
(`' @param {type} name description`) produce real JSDoc output. The entire implementation lives
in `src/convert-brighterscript-docs.ts`; there is no runtime beyond that one file plus a thin
`beforeParse` JSDoc hook.

## Build, lint, test

```
npm install
npm run build      # tsc -> dist/
npm run lint        # eslint "src/**"
npm test            # mocha, spec pattern: src/**/*.spec.ts
npm run testdocs     # scripts/test.sh - runs the plugin against examples/ and diffs output
npm run docs        # builds + generates ./docs from examples/ (uses jsdoc.json + docdash)
```

`npm run preversion` (build + lint + test) is what CI and `npm version`/release-it run — keep all
three green before proposing a change is done.

## Releasing

- `npm run release` — normal stable release (from `master`), publishes to npm under the `latest`
  dist-tag.
- `npm run release:alpha` — prerelease from the `v1` branch (while BrighterScript v1 is in alpha).
  Bumps to a `-alpha.N` version and publishes to npm under the `next` dist-tag, so `npm install
  brighterscript-jsdocs-plugin` still resolves to the stable v0 line; users must explicitly opt in
  with `npm install brighterscript-jsdocs-plugin@next`.

## Code layout

- `src/convert-brighterscript-docs.ts` — everything: comment parsing regexes, `getTypeName`,
  per-statement processors (`processFunction`, `processClass`, `processNamespace`, `processEnum`,
  `processConst`, `processInterface`), and the exported `handlers.beforeParse` JSDoc hook.
- `src/convert-brighterscript-docs.spec.ts` — mocha/chai tests. Uses `expectOutput` from
  `src/testHelpers.spec.ts`, which runs both actual and expected strings through `undent` before
  comparing, so indentation in test literals doesn't matter — write fixtures at whatever
  indentation reads clearly.
- `examples/` — real-ish `.bs`/`.brs` sample files used by `npm run docs` and `npm run testdocs`.
  If you add support for new syntax, consider adding an example here too so generated docs
  exercise it, in addition to a unit test.

## Working with types

Type names in output JSDoc come from `getTypeName(type)`, which asks the BrighterScript AST node
for its type. This project always tracks the `brighterscript` package's type system directly —
when BrighterScript adds new type constructs (unions, new built-in types, etc.), `getTypeName`
and the param/return parsing regexes are the place to extend. Prefer widening `getTypeName` to
handle a new `bs.is*Type()` guard over adding special-case string parsing, and add a matching
mocha test with a minimal `.bs` snippet next to the existing type tests.

## Conventions

- No runtime dependencies beyond `brighterscript` and `jsdoc` itself — this stays a small,
  single-file plugin. Don't introduce new dependencies without a strong reason.
- Tests are the source of truth for expected output formatting; when in doubt about exact
  whitespace/tag ordering in generated JSDoc, run `npm test` rather than guessing.
- Keep `CHANGELOG.md` updated (Keep a Changelog format) for user-facing behavior changes.
- This repo is maintained for both BrightScript (`.brs`) and BrighterScript (`.bs`) syntax — when
  adding a feature, consider whether it's BrighterScript-only (namespaces, classes, interfaces,
  enums, typed params) or applies to plain BrightScript too.
