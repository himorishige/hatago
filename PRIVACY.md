# Privacy Policy

Last Updated: 2025-01-18

## Overview

Hatago is an open-source MCP (Model Context Protocol) server framework that prioritizes user privacy and data protection. This privacy policy explains how Hatago handles data when you use the software.

## Data Collection

### What We DON'T Collect

Hatago does NOT collect, store, or transmit:

- Personal information
- Usage analytics
- Telemetry data
- User behavior metrics
- IP addresses or location data
- Any form of tracking data

### Local Data Processing

All data processing occurs locally on your machine:

- Configuration files remain on your local filesystem
- MCP server interactions are processed locally
- No data is sent to external servers by Hatago itself

### Third-Party MCP Servers

When using Hatago with external MCP servers:

- Data transmission is directly between your instance and the MCP server
- Hatago acts only as a proxy/gateway
- Each MCP server has its own privacy policy
- We recommend reviewing the privacy policies of any external MCP servers you connect to

## Data Storage

### Local Storage Only

Hatago stores data only on your local machine:

- Configuration files in your project directory
- Cache files in designated cache directories (configurable)
- Session data in memory (cleared on restart)
- Log files on your local filesystem (if logging is enabled)

### No Cloud Storage

Hatago does not use any cloud storage services or external databases.

## Security Measures

### Data Protection

We implement security best practices:

- PII (Personally Identifiable Information) masking in logs via Noren
- Secure session management with cryptographically strong IDs
- Sandboxing for subprocess MCP servers
- Permission-based access control
- Resource limits to prevent abuse

### Authentication

- Authentication is optional and configurable
- When enabled, authentication tokens are validated locally
- No authentication data is stored or transmitted externally

## Open Source Transparency

### Code Inspection

- All source code is publicly available on GitHub
- You can inspect exactly how data is handled
- Community contributions are welcome for security improvements

### No Hidden Functionality

- No hidden telemetry
- No backdoors
- No undocumented data collection

## Your Rights

### Data Control

You have complete control over:

- What MCP servers to connect to
- What data to process
- What logs to keep or delete
- What cache to maintain

### Data Deletion

To remove all Hatago-related data:

1. Delete configuration files
2. Clear cache directories
3. Remove log files
4. Uninstall the software

## Children's Privacy

Hatago is a developer tool not intended for use by children under 13 years of age.

## Updates to This Policy

We may update this privacy policy to reflect changes in the software. Updates will be posted to the repository with the date of the last modification.

## Contact Information

For privacy-related questions or concerns:

- Open an issue on GitHub: https://github.com/himorishige/hatago/issues
- Label your issue with "privacy"

## Compliance

### GDPR Compliance

Hatago is designed with GDPR principles in mind:

- Privacy by design
- Data minimization
- User control
- Transparency

### California Privacy Rights

California residents have the right to:

- Know what personal information is collected (none)
- Delete personal information (none collected)
- Opt-out of sale of personal information (we don't sell any data)
- Non-discrimination for exercising privacy rights

## Third-Party Services

### NPM Registry

When installing MCP servers via Runner Plugin:

- Package downloads occur from NPM registry
- NPM's privacy policy applies to package downloads
- Consider using a private registry for sensitive environments

### External MCP Servers

Each external MCP server may have different privacy practices:

- Review their individual privacy policies
- Understand what data they collect
- Use sandboxing features to limit their access

## License

This privacy policy is part of the Hatago project and is covered under the same MIT license.
