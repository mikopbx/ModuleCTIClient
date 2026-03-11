# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Chats proxy address field for SOCKS5/HTTPS proxy configuration
- REST API v3 support for employee updates (avatar, mobile, email) on MikoPBX 2025.1.1+
- Multi-format avatar parsing (JSON, path-only, legacy base64)
- `isPhalcon512Version()` check for PBX version 2025.1.1+

### Fixed
- PHP 7.4 compatibility: replaced `str_starts_with()` with `strpos()` equivalent
- Null-safety for avatar field when passing to typed string parameters
- PSR-12 formatting in AmigoDaemons

[Unreleased]: https://github.com/mikopbx/ModuleCTIClient/compare/master...develop
