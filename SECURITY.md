# Security Policy

## Supported Versions

We release patches for security vulnerabilities. Which versions are eligible for receiving such patches depends on the CVSS v3.0 Rating:

| Version | Supported          |
| ------- | ------------------ |
| 0.4.x   | :white_check_mark: |
| 0.3.x   | :white_check_mark: |
| < 0.3   | :x:                |

## Reporting a Vulnerability

We take the security of Hatago seriously. If you believe you have found a security vulnerability, please report it to us as described below.

### Please DO:

- **Email us directly** at: security@hatago.dev (if available) OR
- **Open a Security Advisory** on GitHub: https://github.com/himorishige/hatago/security/advisories/new
- **Provide detailed information** about the vulnerability
- **Include steps to reproduce** if possible
- **Allow us time to respond** before public disclosure

### Please DON'T:

- Don't disclose the vulnerability publicly until we've had a chance to address it
- Don't exploit the vulnerability beyond what's necessary to demonstrate it
- Don't perform attacks on systems you don't own

## Response Timeline

- **Initial Response**: Within 48 hours
- **Status Update**: Within 7 days
- **Fix Timeline**: Depends on severity
  - Critical: 7-14 days
  - High: 14-30 days
  - Medium: 30-60 days
  - Low: Next regular release

## Security Measures

### Built-in Security Features

1. **Process Sandboxing**
   - Subprocess isolation for MCP servers
   - Permission-based access control
   - Resource limits (memory, CPU, timeout)

2. **Data Protection**
   - PII masking in logs (Noren integration)
   - Secure session management
   - No data collection or telemetry

3. **Authentication & Authorization**
   - OAuth 2.1 support
   - Bearer token validation
   - CORS configuration

4. **Input Validation**
   - JSON-RPC request validation
   - Configuration schema validation
   - Path traversal prevention

### Security Best Practices

#### For Users

1. **Keep Hatago Updated**

   ```bash
   npm update @hatago/core
   ```

2. **Use Minimal Permissions**

   ```yaml
   permissions:
     network: false
     fsWrite: false
     spawn: false
   ```

3. **Enable Authentication in Production**

   ```yaml
   security:
     requireAuth: true
   ```

4. **Review MCP Server Sources**
   - Only use trusted MCP servers
   - Review permissions before granting
   - Use sandboxing for untrusted servers

5. **Secure Configuration**
   - Don't commit secrets to version control
   - Use environment variables for sensitive data
   - Restrict file permissions on config files

#### For Developers

1. **Dependency Management**
   - Regularly update dependencies
   - Use `npm audit` to check for vulnerabilities
   - Pin versions in production

2. **Code Review**
   - Review all PRs for security implications
   - Check for injection vulnerabilities
   - Validate all inputs

3. **Testing**
   - Include security tests
   - Test permission boundaries
   - Verify sandboxing effectiveness

## Known Security Considerations

### MCP Protocol Limitations

- Each HTTP request creates a new session (protocol limitation)
- Session persistence requires external state management
- Chrome extensions may cause session proliferation

### Platform-Specific Sandboxing

- **Linux**: Best sandboxing with firejail/bubblewrap
- **macOS**: Limited sandboxing with sandbox-exec
- **Windows**: Minimal sandboxing (recommend WSL/containers)

### Third-Party MCP Servers

- External servers have their own security posture
- Hatago cannot guarantee the security of external servers
- Use Runner Plugin's sandboxing to limit exposure

## Security Headers

Hatago implements security headers by default:

```yaml
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Content-Security-Policy: default-src 'none'
Strict-Transport-Security: max-age=31536000
```

## Vulnerability Disclosure

We follow responsible disclosure practices:

1. **Private Disclosure**: Report to maintainers
2. **Assessment**: Evaluate severity and impact
3. **Fix Development**: Create and test patches
4. **Coordinated Release**: Release fix with security advisory
5. **Public Disclosure**: After users have time to update

## Security Audit History

| Date | Auditor | Findings | Status |
| ---- | ------- | -------- | ------ |
| TBD  | -       | -        | -      |

_No formal security audits have been conducted yet. Community audits are welcome._

## Compliance

### Standards

- **OAuth 2.1**: Authorization framework
- **RFC 9728**: Protected Resource Metadata
- **MCP Security**: Following Model Context Protocol security best practices

### Certifications

Currently no formal security certifications. Planned for future releases.

## Security Tools

### Recommended Security Tools

1. **npm audit**: Check for known vulnerabilities

   ```bash
   npm audit
   npm audit fix
   ```

2. **Snyk**: Continuous security monitoring

   ```bash
   npx snyk test
   ```

3. **OWASP Dependency Check**: Vulnerability scanning
   ```bash
   dependency-check --scan . --format HTML
   ```

## Contact

For security concerns, contact:

- **GitHub Security Advisories**: Preferred method
- **Email**: security@hatago.dev (if available)
- **GitHub Issues**: For non-sensitive security discussions

## Acknowledgments

We thank the following researchers for responsibly disclosing security issues:

_No submissions yet - be the first!_

## PGP Key

For encrypted communication:

```
-----BEGIN PGP PUBLIC KEY BLOCK-----
[PGP key would be inserted here when available]
-----END PGP PUBLIC KEY BLOCK-----
```
