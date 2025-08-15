# Hatago Operations & Monitoring Guide

Complete guide for operating and monitoring Hatago MCP Server in production environments with SLO-based reliability.

## Overview

Hatago Phase 6 implements a comprehensive operations and monitoring stack designed for production-grade reliability:

- **SLO-based monitoring** with 99.95% availability target
- **Kubernetes-style health checks** for orchestration
- **Graceful shutdown** with drain mechanisms
- **Concurrency limiting** with circuit breaker protection
- **Prometheus alerting** with multi-window burn rate detection
- **Structured logging** with automatic request tracing
- **Plugin security** with cryptographic signature verification

## Quick Start

### 1. Basic Monitoring Setup

```bash
# Start with monitoring stack
cd docs/observability
docker-compose -f docker-compose.monitoring.yml up -d

# Verify metrics collection
curl http://localhost:9090/api/v1/query?query=hatago_requests_total

# Access dashboards
open http://localhost:3000  # Grafana (admin/admin)
open http://localhost:9090  # Prometheus
```

### 2. Production Configuration

```bash
# Environment variables for production
export NODE_ENV=production
export LOG_LEVEL=info
export PLUGIN_SECURITY_ENABLED=true
export REQUIRE_SIGNED_PLUGINS=true
export GRACEFUL_TIMEOUT_MS=30000

# Start Hatago with production settings
pnpm start
```

### 3. Health Check Verification

```bash
# Liveness probe (process alive)
curl http://localhost:8787/health/live

# Readiness probe (ready to serve)
curl http://localhost:8787/health/ready

# Startup probe (initialization complete)
curl http://localhost:8787/health/startup
```

## Service Level Objectives (SLOs)

### Target Metrics

| Metric | Target | Measurement Window | Alert Threshold |
|--------|--------|-------------------|-----------------|
| **Availability** | 99.95% | 30-day rolling | <99.95% over 5min |
| **P95 Latency** | <5ms | 5-minute window | >5ms for 5min |
| **P99 Latency** | <10ms | 5-minute window | >10ms for 5min |
| **Error Rate** | <0.1% | 5-minute window | >0.1% for 3min |

### SLO Monitoring

```bash
# Check current SLO status
curl http://localhost:8787/metrics | grep hatago_slo_target

# Query SLO compliance
curl "http://localhost:9090/api/v1/query?query=hatago:success_rate:5m"

# View error budget burn rate
curl "http://localhost:9090/api/v1/query?query=hatago:error_rate:5m"
```

## Health Check System

### Health Endpoints

Hatago implements Kubernetes-style health checks:

```bash
# Liveness: Process is alive and responding
GET /health/live
Response: {"status":"pass","timestamp":"2024-08-15T10:30:00Z","uptime":3600}

# Readiness: Ready to accept traffic
GET /health/ready  
Response: {"status":"pass","checks":{"plugins":"pass","mcp":"pass"}}

# Startup: Initialization completed
GET /health/startup
Response: {"status":"pass","initialized":true,"plugins_loaded":5}
```

### Kubernetes Integration

```yaml
# deployment.yaml
spec:
  containers:
  - name: hatago
    livenessProbe:
      httpGet:
        path: /health/live
        port: 8787
      initialDelaySeconds: 30
      periodSeconds: 10
    readinessProbe:
      httpGet:
        path: /health/ready
        port: 8787
      initialDelaySeconds: 5
      periodSeconds: 5
    startupProbe:
      httpGet:
        path: /health/startup
        port: 8787
      initialDelaySeconds: 10
      periodSeconds: 10
      failureThreshold: 30
```

## Graceful Shutdown

### Signal Handling

Hatago supports graceful shutdown with proper request draining:

```bash
# Trigger graceful shutdown
kill -TERM <hatago-pid>

# Force shutdown after timeout
kill -KILL <hatago-pid>
```

### Shutdown Process

1. **Drain initiation** - Server stops accepting new requests
2. **Request completion** - Existing requests finish processing  
3. **Resource cleanup** - Connections closed, plugins unloaded
4. **Process termination** - Clean exit after timeout

### Configuration

```bash
# Graceful shutdown timeout (default: 30s)
GRACEFUL_TIMEOUT_MS=30000

# Test drain endpoint
curl -X POST http://localhost:8787/drain
```

## Concurrency Protection

### Circuit Breaker

Automatic overload protection with circuit breaker pattern:

```bash
# Check circuit breaker status
curl http://localhost:8787/mcp -d '{
  "jsonrpc":"2.0",
  "method":"tools/call",
  "params":{"name":"concurrency.status"}
}'

# Test circuit breaker
curl http://localhost:8787/mcp -d '{
  "jsonrpc":"2.0",
  "method":"tools/call",
  "params":{
    "name":"concurrency.test",
    "arguments":{"action":"trigger_failure","count":10}
  }
}'
```

### Configuration

```javascript
// Default concurrency limits
{
  maxConcurrency: 1000,        // Max concurrent requests
  maxQueueSize: 500,           // Queue for waiting requests
  timeoutMs: 30000,            // Request timeout
  circuitBreakerThreshold: 10, // Failures before opening
  circuitBreakerResetMs: 60000 // Time before retry
}
```

## Alerting System

### Alert Categories

**Critical Alerts** (Immediate response):
- Availability SLO breach (<99.95%)
- Instance down (>30s)
- Circuit breaker open

**Warning Alerts** (Monitor and plan):
- Latency SLO breach (P95 >5ms, P99 >10ms)
- Error rate SLO breach (>0.1%)
- High memory usage (>80%)

### Multi-Window Burn Rate Detection

```yaml
# Fast burn rate: 2% budget in 1 hour
- alert: HatagoAvailabilitySLOBurnRateFast
  expr: |
    (hatago:error_rate:5m > (14.4 * 0.0005) and
     hatago:error_rate:1h > (14.4 * 0.0005))
  for: 2m

# Slow burn rate: 10% budget in 24 hours  
- alert: HatagoAvailabilitySLOBurnRateSlow
  expr: |
    (hatago:error_rate:30m > (2.88 * 0.0005) and
     hatago:error_rate:6h > (2.88 * 0.0005))
  for: 15m
```

### Alert Testing

```bash
# Simulate high error rate
for i in {1..20}; do
  curl http://localhost:8787/nonexistent &
done

# Check alert status
curl http://localhost:9093/api/v1/alerts
```

## Structured Logging

### Log Format

**Development** (compact format):
```
10:30:45 INFO [hatago-core] Request completed {"method":"POST","status":200,"duration_ms":42}
```

**Production** (JSON format):
```json
{
  "timestamp": "2024-08-15T10:30:45.123Z",
  "level": 1,
  "message": "Request completed",
  "component": "hatago-core",
  "trace_id": "trace-1692097845123-abc123",
  "meta": {
    "method": "POST",
    "path": "/mcp",
    "status": 200,
    "duration_ms": 42
  }
}
```

### Log Management

```bash
# Query logs via HTTP
curl "http://localhost:8787/logs?limit=50&level=2"

# Query logs via MCP
curl http://localhost:8787/mcp -d '{
  "jsonrpc":"2.0",
  "method":"tools/call",
  "params":{
    "name":"logs.query",
    "arguments":{"level":"warn","limit":20}
  }
}'

# Log configuration
curl http://localhost:8787/mcp -d '{
  "jsonrpc":"2.0",
  "method":"tools/call",
  "params":{"name":"logs.config"}
}'
```

### Security Features

- **Automatic redaction** of sensitive fields
- **Request tracing** with correlation IDs
- **Configurable log levels** by environment
- **Memory-efficient buffering** (1000 entries default)

## Plugin Security

### Signature Verification

Cryptographic verification of plugin integrity:

```bash
# Generate test key
curl http://localhost:8787/mcp -d '{
  "jsonrpc":"2.0",
  "method":"tools/call",
  "params":{
    "name":"security.generate_key",
    "arguments":{"algorithm":"ed25519"}
  }
}'

# Check security status
curl http://localhost:8787/security/status

# List trusted keys
curl http://localhost:8787/security/keys
```

### Security Policies

**Development** (Permissive):
```bash
PLUGIN_SECURITY_ENABLED=true
REQUIRE_SIGNED_PLUGINS=false
NODE_ENV=development
```

**Production** (Strict):
```bash
PLUGIN_SECURITY_ENABLED=true
REQUIRE_SIGNED_PLUGINS=true
NODE_ENV=production
```

### Supported Algorithms

- **Ed25519** - Recommended for new deployments
- **RSA-PSS** - Legacy compatibility (2048-bit)
- **ECDSA-P256** - FIPS compliance

## Integration Testing

### End-to-End Test Suite

```bash
# Run integration tests
cd tests/integration
npm test

# Test specific components
npm run test:health
npm run test:metrics
npm run test:security
npm run test:logging
```

### Manual Testing Checklist

**Health Checks**:
- [ ] Liveness probe responds correctly
- [ ] Readiness probe reflects service state
- [ ] Startup probe indicates initialization
- [ ] Drain endpoint stops accepting requests

**Metrics & Alerting**:
- [ ] Prometheus scrapes metrics successfully
- [ ] SLO targets are exposed correctly
- [ ] Alerts fire on SLO breaches
- [ ] Grafana dashboards display data

**Logging**:
- [ ] Structured logs are formatted correctly
- [ ] Sensitive data is redacted
- [ ] Request tracing works end-to-end
- [ ] Log queries return expected results

**Security**:
- [ ] Key generation works correctly
- [ ] Signature verification passes/fails appropriately
- [ ] Security metrics are tracked
- [ ] Untrusted plugins are blocked (if configured)

**Graceful Shutdown**:
- [ ] SIGTERM triggers drain mode
- [ ] In-flight requests complete
- [ ] New requests are rejected during shutdown
- [ ] Process exits cleanly within timeout

### Load Testing

```bash
# Install load testing tools
npm install -g autocannon

# Basic load test
autocannon -c 10 -d 30 http://localhost:8787/health/ready

# MCP endpoint load test
autocannon -c 5 -d 60 \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -b '{"jsonrpc":"2.0","method":"tools/list"}' \
  http://localhost:8787/mcp

# Monitor during load test
watch 'curl -s http://localhost:8787/metrics | grep hatago_'
```

## Production Deployment

### Infrastructure Requirements

**Minimum Resources**:
- CPU: 0.5 cores
- Memory: 512MB
- Disk: 1GB
- Network: 100Mbps

**Recommended Resources**:
- CPU: 2 cores
- Memory: 2GB
- Disk: 10GB SSD
- Network: 1Gbps

### Environment Configuration

```bash
# Core settings
NODE_ENV=production
PORT=8787
HOSTNAME=0.0.0.0

# Logging
LOG_LEVEL=info
LOG_FORMAT=json

# Security
PLUGIN_SECURITY_ENABLED=true
REQUIRE_SIGNED_PLUGINS=true

# Auth (if required)
REQUIRE_AUTH=true
AUTH_ISSUER=https://auth.company.com

# Graceful shutdown
GRACEFUL_TIMEOUT_MS=30000

# Resource limits
HATAGO_MAX_CONCURRENCY=1000
HATAGO_MAX_QUEUE_SIZE=500
```

### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist/ ./dist/
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:8787/health/ready || exit 1
USER node
CMD ["node", "dist/index.js"]
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: hatago
spec:
  replicas: 3
  selector:
    matchLabels:
      app: hatago
  template:
    metadata:
      labels:
        app: hatago
    spec:
      containers:
      - name: hatago
        image: hatago:latest
        ports:
        - containerPort: 8787
        env:
        - name: NODE_ENV
          value: "production"
        resources:
          requests:
            memory: "512Mi"
            cpu: "0.5"
          limits:
            memory: "2Gi"
            cpu: "2"
        livenessProbe:
          httpGet:
            path: /health/live
            port: 8787
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 8787
          initialDelaySeconds: 5
          periodSeconds: 5
        startupProbe:
          httpGet:
            path: /health/startup
            port: 8787
          initialDelaySeconds: 10
          periodSeconds: 10
          failureThreshold: 30
---
apiVersion: v1
kind: Service
metadata:
  name: hatago-service
spec:
  selector:
    app: hatago
  ports:
  - port: 8787
    targetPort: 8787
  type: ClusterIP
```

## Monitoring Best Practices

### 1. Observability Strategy

- **RED method**: Rate, Errors, Duration for user-facing services
- **USE method**: Utilization, Saturation, Errors for resources
- **SLO-driven alerting**: Focus on user experience, not system metrics

### 2. Alert Fatigue Prevention

- **Tiered alerting**: Critical vs warning severity
- **Intelligent routing**: Route alerts to appropriate teams
- **Alert suppression**: Prevent redundant notifications
- **Runbook automation**: Include remediation steps

### 3. Dashboard Design

- **SLO overview**: Primary metrics prominently displayed
- **Request flow**: Track requests from ingress to response
- **Error analysis**: Break down errors by type and source
- **Capacity planning**: Resource utilization trends

### 4. Log Management

- **Centralized logging**: Aggregate logs from all instances
- **Structured format**: Enable efficient parsing and analysis
- **Retention policy**: Balance storage costs with debugging needs
- **Search capabilities**: Fast log querying for incident response

## Troubleshooting Guide

### Common Issues

**High Latency**:
1. Check system resources (CPU, memory)
2. Review slow request patterns in logs
3. Examine database/external service performance
4. Consider scaling horizontally

**Memory Leaks**:
1. Monitor memory usage trends
2. Check plugin resource management
3. Review log buffer sizes
4. Restart affected instances

**Security Violations**:
1. Check plugin signature verification logs
2. Review trusted key configuration
3. Validate signing process
4. Update security policies if needed

**Circuit Breaker Issues**:
1. Identify root cause of failures
2. Check downstream dependencies
3. Manually reset circuit breaker
4. Implement gradual traffic recovery

### Debug Commands

```bash
# System health
curl http://localhost:8787/health/ready

# Metrics snapshot
curl http://localhost:8787/metrics

# Recent logs
curl "http://localhost:8787/logs?limit=50"

# Security status
curl http://localhost:8787/security/status

# MCP tools list
curl http://localhost:8787/mcp -d '{"jsonrpc":"2.0","method":"tools/list"}'
```

## Conclusion

Hatago's Phase 6 operations and monitoring implementation provides a production-ready foundation for reliable MCP service delivery. The combination of SLO-based monitoring, comprehensive health checks, structured logging, and security features ensures operational excellence while maintaining the project's core philosophy of simplicity and efficiency.

For additional details, refer to the component-specific documentation in:
- `docs/observability/` - Monitoring and alerting setup
- `docs/logging/` - Structured logging configuration  
- `docs/security/` - Plugin security and signing
- `docs/health/` - Health check implementation