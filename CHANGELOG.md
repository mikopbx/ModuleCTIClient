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
- `/pbx/users` provisioning: external SIP/TLS ports for clients connecting through the PBX external address (`X-Client-Host`), single normalized transport honouring the client's current choice (`X-Client-Transport`), and `tls_login` (`<number>-TLS`) on cores that generate parallel TLS endpoints (MikoPBX 2026.2.118+); clients without the headers keep the previous raw `transport` value
- "CTI application" tab: download links for the Miko CTI desktop client (Windows, macOS Intel, macOS Apple Silicon) and a gallery of client screenshots

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
- Settings tabs no longer overflow the form on narrow screens: long tab titles are truncated with an ellipsis

[Unreleased]: https://github.com/mikopbx/ModuleCTIClient/compare/master...develop
