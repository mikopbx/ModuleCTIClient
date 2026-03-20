# Contributing to ModuleCTIClient

Thank you for your interest in contributing!

## Development Environment

- PHP 7.4+ (must also work on PHP 8.4)
- Phalcon 4.x / 5.x framework (version-dependent, see `Lib/MikoPBXVersion.php`)
- MikoPBX 2023.2+ for testing
- Node.js for JavaScript compilation

## Coding Standards

### PHP

- PSR-4 autoloading: `Modules\ModuleCTIClient\` maps to repository root
- Follow PSR-12 coding style
- Run `phpstan` to check code quality after changes
- **Do not use** PHP 8.0+ features (`str_starts_with`, `match`, named arguments, enums, etc.) -- the module must work on PHP 7.4

### JavaScript

- Source files in `public/assets/js/src/`
- Compiled output in `public/assets/js/`
- Compile with Babel using airbnb preset:
  ```bash
  npx babel public/assets/js/src/ --out-dir public/assets/js/ --source-maps inline --presets airbnb
  ```

## Translations

The module supports 31 languages. Translation files are in `Messages/` directory.

- All translation keys use `mod_cti_` prefix
- When adding new strings, add them to at least `en.php` and `ru.php`
- Translations are managed via Weblate

## Submitting Changes

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Ensure `phpstan` passes for PHP changes
5. Compile JavaScript if you modified source files
6. Add translations if you added new UI strings
7. Submit a pull request

## Reporting Issues

- Use GitHub Issues for bug reports and feature requests
- Include MikoPBX version, module version, and architecture (amd64/arm64)

## License

By contributing, you agree that your contributions will be licensed under GPL-3.0-or-later.
