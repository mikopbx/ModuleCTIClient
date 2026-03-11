[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0) [![GitHub Release](https://img.shields.io/github/v/release/mikopbx/ModuleCTIClient)](https://github.com/mikopbx/ModuleCTIClient/releases) [![PHP 7.4+](https://img.shields.io/badge/PHP-7.4%2B-777BB4.svg)](https://www.php.net/) [![MikoPBX 2023.2+](https://img.shields.io/badge/MikoPBX-2023.2%2B-1DBF73.svg)](https://www.mikopbx.com/) [![Issues](https://img.shields.io/github/issues/mikopbx/ModuleCTIClient)](https://github.com/mikopbx/ModuleCTIClient/issues)

[English](README.md) | [Русский](README.ru.md)

# ModuleCTIClient

CTI (Computer Telephony Integration) module for MikoPBX. Integrates the PBX with 1C CRM and messaging services (Telegram, chats) via a desktop client application.

**Product website:** [telefon.miko.ru](https://telefon.miko.ru)

## Features

- Integration with 1C CRM via web services or long polling
- Real-time call notifications and caller ID lookup from 1C
- Desktop CTI client with click-to-call, call transfer, and call history
- Telegram and chat messenger integration
- User avatar, mobile number, and email management via web interface
- CallerID transliteration (Cyrillic to Latin)
- NATS-based messaging for real-time event delivery
- Proxy server for secure external connections
- Speech recognition support with Russian morphology dictionaries
- Multi-architecture support (x86_64, ARM64)
- Compatible with MikoPBX 2023.2+ through 2025.x (PHP 7.4 -- PHP 8.4)

## Installation

1. Open the MikoPBX web interface.
2. Navigate to **Modules** > **Marketplace**.
3. Find **ModuleCTIClient** in the list and click **Install**.
4. Once installed, enable the module on the **Modules** > **Installed** page.

## Configuration

After enabling the module, open its settings page in MikoPBX.

### 1C CRM Connection

- **Server address** -- hostname or IP of the 1C server
- **Port** -- HTTP port (default 80)
- **Protocol** -- HTTP or HTTPS
- **Login / Password** -- credentials for the 1C web service
- **Publication name** -- 1C information base publication name

### Connection Mode

- **Web service mode** -- uses 1C web services for data exchange
- **Long polling mode** -- the module acts as a server, 1C connects to it

### Additional Settings

- **Auto settings mode** -- generates a configuration string for easy client setup
- **CallerID from 1C** -- enables caller name lookup from CRM during incoming calls
- **CallerID transliteration** -- converts Cyrillic names to Latin for SIP devices
- **Chats proxy** -- SOCKS5 or HTTPS proxy for messenger daemon connections
- **Debug mode** -- enables detailed logging

## Background Services

The module manages the following daemons:

| Service | Description | Port |
|---|---|---|
| `gnatsd-cti` | NATS message queue | 4222, 8222 |
| `amid` | Asterisk Manager Interface listener | 8000 |
| `crmd` | 1C CRM integration | -- |
| `authd` | Authentication service | -- |
| `chatsd` | Chat message processing | 8228 |
| `tgd` | Telegram integration | -- |
| `proxyd` | Proxy server (HTTPS) | 8002 |
| `speechd` | Speech recognition/synthesis | -- |
| `monitord` | Master daemon orchestrator | -- |

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `getExtensions` | List of extensions with SIP credentials and avatars |
| GET | `getIdMatchNamesList` | Queues, IVRs, conferences, and providers |
| POST | `updateUserAvatar` | Update user avatar image |
| POST | `updateUserMobile` | Update user mobile number |
| POST | `updateUserEmail` | Update user email |
| GET | `getUserAvatar/{hash}` | Retrieve avatar image by hash |

## Requirements

- MikoPBX 2023.2.206+
- PHP 7.4 -- 8.4
- License key (product ID: 85)

## Support

- **Website**: [telefon.miko.ru](https://telefon.miko.ru)
- **Issues**: [GitHub Issues](https://github.com/mikopbx/ModuleCTIClient/issues)
- **Email**: [help@miko.ru](mailto:help@miko.ru)

## License

GPL-3.0-or-later
