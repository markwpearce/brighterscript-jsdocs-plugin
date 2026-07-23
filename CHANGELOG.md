# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

-   Enum and const values containing BrightScript hex literals (`&hFF0000FF`) are now normalized to valid JS syntax (`0xFF0000FF`) before being emitted, instead of breaking jsdoc's parser ([#14](https://github.com/markwpearce/brighterscript-jsdocs-plugin/issues/14))

### Added

-   Support for BrighterScript v1 type syntax in doc comments: union types (`string or integer` → `{(string|integer)}`), typed arrays (`string[]` → `{Array.<string>}`, including arrays of custom class/interface types), and intersection types (`A and B`, which fall back to `{dynamic}` since JSDoc's type grammar has no intersection operator)
-   `AGENTS.md` with instructions for AI coding agents; `CLAUDE.md` now points to it

### Changed

-   Updated to `brighterscript@^1.0.0-alpha.52` (BrighterScript v1 is still in alpha). This is a `dependency`, not a `peerDependency`, matching the convention used on other RokuCommunity projects' `v1` branches (eg. bslint)
-   Releases from this branch are alpha prereleases: `npm run release:alpha` bumps a `-alpha.N` version and publishes to npm under the `next` dist-tag (not `latest`), so this doesn't become the default install
-   Ported the plugin's AST traversal to BrighterScript v1's restructured parser API: `CommentStatement` no longer exists in v1 (comments are lexer trivia, not AST statements), and many statement properties moved under a `.tokens` object

## [0.7.3]

### Fixed

-   Wrong file in package.json

## [0.7.2]

### Added

-   Support for Brighterscript Interfaces, Consts, Enums

### Changed

-   Brighterscript Namespaces are not placed under modules
-   Much better and consistent JSdoc output
-   Added unit tests
-   Migrated to TypeScript

## [0.6.0]

### Added

-   Previous Release
