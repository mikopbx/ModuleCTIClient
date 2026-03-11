# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| Latest  | Yes                |
| < 2.0   | No                 |

## Reporting a Vulnerability

If you discover a security vulnerability in ModuleCTIClient, please report it responsibly. **Do not open a public issue.**

Send an email to **help@miko.ru** with the following details:

- A clear description of the vulnerability
- Steps to reproduce the issue
- An assessment of the potential impact

We will acknowledge your report within **5 business days** and work with you to coordinate a disclosure timeline before any public announcement.

## Security Considerations

- **NATS message queue.** The NATS server listens on TCP port 4222. Access is password-protected. Restrict network access via firewall rules to trusted clients only.
- **Proxy server.** The HTTPS proxy (port 8002) provides external connectivity for CTI clients. Ensure proper firewall configuration.
- **AMI credentials.** Asterisk Manager Interface credentials are auto-generated during installation with random passwords.
- **1C web service credentials.** Login and password for 1C integration are stored in the module database. Access to the settings page requires MikoPBX admin authentication.
