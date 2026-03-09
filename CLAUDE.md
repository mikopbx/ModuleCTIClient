# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ModuleCTIClient — MikoPBX module for Computer Telephony Integration with 1C CRM and messaging services (Telegram, chats). Manages 9 background daemons (NATS, AMI, CRM, Auth, Chats, Telegram, Proxy, Speech, Monitor) via `Lib/AmigoDaemons.php`.

## Build & Compile

**JavaScript** (source in `public/assets/js/src/`, compiled to `public/assets/js/`):
```bash
/Users/nb/PhpstormProjects/mikopbx/MikoPBXUtils/node_modules/.bin/babel \
  "public/assets/js/src/module-cti-client-index.js" \
  --out-dir "public/assets/js/" \
  --source-maps inline --presets airbnb
```
Repeat for each source file in `src/`.

**PHP static analysis:**
```bash
phpstan analyse
```

No test suite exists. No composer install needed (dependencies come from MikoPBX core).

## Architecture

### MVC (Phalcon Framework)
- **Controller**: `App/Controllers/ModuleCTIClientController.php` — settings UI, JSON API endpoints for extensions/avatars/mobile/email
- **Model**: `Models/ModuleCTIClient.php` — settings table `m_ModuleCTIClient`, extends `ModulesModelsBase`
- **Form**: `App/Forms/ModuleCTIClientForm.php` — Phalcon form elements
- **View**: `App/Views/index.volt` — Volt template with Semantic UI

### Key Libraries
- `Lib/CTIClientConf.php` — Module lifecycle hooks (enable/disable, dialplan generation, firewall rules, REST API callbacks)
- `Lib/AmigoDaemons.php` — Daemon process management, generates JSON configs to `/etc/custom_modules/ModuleCTIClient/`
- `Lib/MikoPBXVersion.php` — Version compatibility layer (see below)
- `Setup/PbxExtensionSetup.php` — DB schema creation, file installation, sidebar registration

### Daemon Ecosystem
AmigoDaemons orchestrates: `gnatsd-cti` (NATS), `amid` (AMI), `crmd` (1C CRM), `authd`, `chatsd`, `tgd` (Telegram), `proxyd`, `speechd`, `monitord` (master orchestrator). Binaries in `bin/`, configs generated as JSON to `confDir`.

## PHP Version Compatibility (Critical)

Code MUST work on both **PHP 7.4** and **PHP 8.4**. Key rules:

- **Never use** `str_starts_with()`, `str_ends_with()`, `str_contains()`, `match` expressions, named arguments, enums, fibers, readonly properties, intersection types — these are PHP 8.0+
- Use `strpos($s, $needle) === 0` instead of `str_starts_with()`
- Use `$s[0] === '{'` for single-char prefix checks
- Null-safe: always use `?? ''` when passing nullable values to typed `string` parameters (PHP 8.1+ strict)

### Phalcon Version Branching
`MikoPBXVersion.php` provides version checks for three tiers:

| PBX Version | Method | Phalcon | Notes |
|---|---|---|---|
| < 2024.2.30 | — | 4.x | Legacy Phalcon classes |
| > 2024.2.30 | `isPhalcon5Version()` | 5.x | Phalcon\Filter\Validation, Di\Di |
| > 2025.1.1 | `isPhalcon512Version()` | 5.12+ | REST API v3 for employee CRUD, file-based avatars |

When modifying controller actions that touch Users/Extensions models, check if a `isPhalcon512Version()` branch is needed for REST API v3 routing.

## Translations

31 language files in `Messages/`. Key format: `'mod_cti_KeyName' => 'Translation'`.
- Volt templates: `{{ t._('mod_cti_KeyName') }}`
- JavaScript: `globalTranslate.mod_cti_KeyName`
- New keys must be added to at least `en.php` and `ru.php`

## Module Manifest

`module.json`: moduleUniqueID=`ModuleCTIClient`, min_pbx_version=`2023.2.206`, lic_product_id=`85`

## Conventions

- PSR-12 coding style for PHP
- `composer.json` defines PSR-4 autoloading: `Modules\ModuleCTIClient\`
- Do not commit to git unless explicitly requested
- AGI scripts in `agi-bin/` are called from Asterisk dialplan for CallerID lookup
