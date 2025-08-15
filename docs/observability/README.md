# Hatago Observability Stack

Complete monitoring setup for Hatago MCP Server with SLO-based alerting and Grafana dashboards.

## Overview

This observability stack provides:

- **Prometheus** - Metrics collection and alerting
- **Grafana** - Visualization and dashboards
- **AlertManager** - Alert routing and notifications
- **SLO-based monitoring** - 99.95% availability, <5ms P95, <10ms P99, <0.1% error rate

## Quick Start

### 1. Start the monitoring stack

```bash
# From the project root
cd docs/observability
docker-compose -f docker-compose.monitoring.yml up -d
```

### 2. Access the dashboards

- **Grafana**: http://localhost:3000 (admin/admin)
- **Prometheus**: http://localhost:9090
- **AlertManager**: http://localhost:9093

### 3. Verify metrics collection

```bash
# Check if Hatago metrics are being scraped
curl -s http://localhost:9090/api/v1/query?query=hatago_requests_total | jq

# View current SLO status
curl -s http://localhost:9090/api/v1/query?query=hatago:success_rate:5m | jq
```

## SLO Targets

| Metric | Target | Alert Threshold | Burn Rate Window |
|--------|--------|----------------|------------------|
| Availability | 99.95% | <99.95% | 5m (fast), 30m (slow) |
| P95 Latency | <5ms | >5ms | 5m |
| P99 Latency | <10ms | >10ms | 5m |
| Error Rate | <0.1% | >0.1% | 5m |

## Alert Configuration

### Multi-Window Burn Rate Alerts

- **Fast burn**: 2% budget in 1 hour (14.4x burn rate)
- **Slow burn**: 10% budget in 24 hours (2.88x burn rate)

### Alert Severity Levels

- **Critical**: SLO breaches, instance down
- **Warning**: Performance degradation, plugin failures

### Notification Channels

Configure in `alertmanager.yml`:
- Webhook endpoints
- Email notifications
- Slack/Discord integration
- PagerDuty escalation

## Dashboard Panels

### SLO Overview
- Real-time availability percentage
- P95/P99 latency trends
- Error rate monitoring
- SLO burn rate status

### Request Metrics
- Request rate (req/s)
- Response time percentiles
- Error distribution by status code
- Inflight request count

### Plugin Monitoring
- Plugin event rates
- Plugin failure tracking
- Circuit breaker status
- Concurrency limiter metrics

## Runbooks

Create runbook documentation for common scenarios:

### Availability SLO Breach
1. Check instance health: `curl http://localhost:8787/health/live`
2. Review error logs and recent deployments
3. Examine circuit breaker status
4. Scale horizontally if needed

### Latency SLO Breach
1. Check system resources (CPU, memory)
2. Review slow query patterns
3. Analyze request patterns and traffic spikes
4. Consider caching or optimization

### Circuit Breaker Open
1. Identify root cause of failures
2. Check downstream dependencies
3. Manual circuit reset if appropriate
4. Implement gradual traffic recovery

## Development

### Adding New Metrics

1. Update metrics collection in `packages/core/src/plugins/slo-metrics.ts`
2. Add recording rules in `prometheus-rules.yml`
3. Create alerts for SLO breaches
4. Update Grafana dashboard panels

### Custom Alert Rules

```yaml
- alert: CustomAlert
  expr: your_metric > threshold
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Custom alert description"
    runbook_url: "https://github.com/himorishige/hatago/docs/runbooks/custom.md"
```

### Dashboard Customization

Import the dashboard JSON into Grafana and customize:
1. Panel queries and visualizations
2. Alert annotations
3. Template variables
4. Threshold values

## Production Deployment

### Persistent Storage

Configure volumes for data persistence:
- Prometheus data: 15 days retention
- Grafana dashboards and users
- AlertManager silences and configurations

### Security

- Enable authentication for Grafana
- Configure TLS certificates
- Restrict network access to monitoring stack
- Use secrets management for credentials

### Scaling

- Configure Prometheus federation for multi-instance monitoring
- Use remote storage for long-term metrics retention
- Deploy highly available AlertManager cluster
- Consider Prometheus Operator for Kubernetes deployments

## Troubleshooting

### Common Issues

**Metrics not appearing**:
- Verify Hatago `/metrics` endpoint is accessible
- Check Prometheus target health
- Confirm scrape configuration

**Alerts not firing**:
- Test alert expressions in Prometheus
- Check AlertManager routing rules
- Verify notification endpoints

**Dashboard not loading**:
- Check Grafana datasource configuration
- Verify Prometheus connectivity
- Review dashboard panel queries

### Log Locations

- Prometheus: `/var/log/prometheus/`
- Grafana: `/var/log/grafana/`
- AlertManager: `/var/log/alertmanager/`

## Contributing

1. Test configuration changes locally
2. Validate Prometheus rules: `promtool check rules prometheus-rules.yml`
3. Update documentation for new metrics or alerts
4. Consider SLO impact of new monitoring overhead