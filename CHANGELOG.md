# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0-alpha.56] - 2026-10-02

### Fixed

- Enum and const values containing BrightScript hex literals (`&hFF0000FF`) are now normalized to valid JS syntax (`0xFF0000FF`) before being emitted, instead of breaking jsdoc's parser ([#14](https://github.com/markwpearce/brighterscript-jsdocs-plugin/issues/14))
- Class fields with an object literal default value (`foo = {}`) no longer crash with `this.getLookupTable is not a function` (fixed upstream in `brighterscript@1.0.0-alpha.56`) ([#17](https://github.com/markwpearce/brighterscript-jsdocs-plugin/issues/17))
- Constants with a non-literal value (eg. `1.0 / 30.0`, `-1`, or a reference to another constant) no longer emit `[object Object]` and break jsdoc's parser; the value's source text is used as the `@default` instead ([#18](https://github.com/markwpearce/brighterscript-jsdocs-plugin/issues/18))
- Multi-line `@param` and `@returns` descriptions now stay with their tag instead of being appended to the function's description. Lines following one of those tags (up to the next tag or a blank comment line) are treated as part of its description ([#11](https://github.com/markwpearce/brighterscript-jsdocs-plugin/issues/11))
- Nested namespaces (a `namespace` block inside another) no longer repeat the parent's name, which produced paths like `BGE.BGE.Model3dOps` and a stray `BGE/BGE` namespace page ([markwpearce/brighterscript-game-engine#268](https://github.com/markwpearce/brighterscript-game-engine/issues/268))

### Added

- Support for BrighterScript v1 type syntax in doc comments: union types (`string or integer` → `{(string|integer)}`), typed arrays (`string[]` → `{Array.<string>}`, including arrays of custom class/interface types), and intersection types (`A and B`, which fall back to `{dynamic}` since JSDoc's type grammar has no intersection operator)
- `AGENTS.md` with instructions for AI coding agents; `CLAUDE.md` now points to it

### Changed

- Updated to `brighterscript@^1.0.0-alpha.56` (BrighterScript v1 is still in alpha). This is a `dependency`, not a `peerDependency`, matching the convention used on other RokuCommunity projects' `v1` branches (eg. bslint)
- Releases from this branch are alpha prereleases: `npm run release:alpha` bumps a `-alpha.N` version and publishes to npm under the `next` dist-tag (not `latest`), so this doesn't become the default install
- Ported the plugin's AST traversal to BrighterScript v1's restructured parser API: `CommentStatement` no longer exists in v1 (comments are lexer trivia, not AST statements), and many statement properties moved under a `.tokens` object

## [0.7.3]

### Fixed

- Wrong file in package.json

## [0.7.2]

### Added

- Support for Brighterscript Interfaces, Consts, Enums

### Changed

- Brighterscript Namespaces are not placed under modules
- Much better and consistent JSdoc output
- Added unit tests
- Migrated to TypeScript

## [0.6.0]

### Added

- Previous Release
