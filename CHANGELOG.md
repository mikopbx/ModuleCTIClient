# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Remote messenger offload: run WhatsApp, Telegram and MAX channels on a dedicated VPS over a secure SSH tunnel, switchable per service
- Warm-standby mirror of remote messenger sessions with automatic and operator-gated failback when the VPS is lost — no re-authorization needed
- Module upgrades are propagated to the offloaded VPS components automatically
- Incremental download of offloaded messenger logs from the VPS so they appear as if running locally
- Services status panel redesigned as a table with per-channel location badges (local / VPS) and live migration state
- Chats proxy address field for SOCKS5/HTTPS proxy configuration
- REST API v3 support for employee updates (avatar, mobile, email) on MikoPBX 2025.1.1+
- Multi-format avatar parsing (JSON, path-only, legacy base64)
- `isPhalcon512Version()` check for PBX version 2025.1.1+

### Changed
- Messenger proxy settings split per service; MTProxy accepts proxy links and base64 secrets with automatic normalization
- Connection test moved into the module interface, with a start-up grace period and progress indicators

### Fixed
- 1C initial-setup wizard reported "not connected" even with a healthy connection
- 1C initial-setup wizard could silently disable messenger offload toggles
- Stuck or orphaned channel migrations now time out and roll back cleanly
- SSH connection test on older PBX cores
- PHP 7.4 compatibility: replaced `str_starts_with()` with `strpos()` equivalent
- Null-safety for avatar field when passing to typed string parameters
- PSR-12 formatting in AmigoDaemons

[Unreleased]: https://github.com/mikopbx/ModuleCTIClient/compare/master...develop
