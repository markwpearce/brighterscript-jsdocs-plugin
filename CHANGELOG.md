# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

-   Enum and const values containing BrightScript hex literals (`&hFF0000FF`) are now normalized to valid JS syntax (`0xFF0000FF`) before being emitted, instead of breaking jsdoc's parser ([#14](https://github.com/markwpearce/brighterscript-jsdocs-plugin/issues/14))

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
