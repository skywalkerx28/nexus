# IBKR Gateway Headless Setup

## Overview

This runbook covers setting up Interactive Brokers (IBKR) Gateway in headless mode for Nexus trading operations.

## Prerequisites

- IBKR account (paper or live)
- IB Gateway or TWS installed
- Java Runtime Environment (JRE) 8 or later

## Installation

### macOS

```bash
# Download IB Gateway from IBKR website
# https://www.interactivebrokers.com/en/trading/ibgateway-stable.php

# Install the downloaded package
# Follow the installer instructions
```

### Linux

```bash
# Download IB Gateway
wget https://download2.interactivebrokers.com/installers/ibgateway/latest-standalone/ibgateway-latest-standalone-linux-x64.sh

# Make executable and install
chmod +x ibgateway-latest-standalone-linux-x64.sh
./ibgateway-latest-standalone-linux-x64.sh -q

# Install to: ~/Jts (default)
```

## Configuration

### Enable API Access

1. Launch IB Gateway (GUI mode first time)
2. Login with your credentials
3. Navigate to: **Configure → Settings → API → Settings**
4. Enable the following:
   - Enable ActiveX and Socket Clients
   - Allow connections from localhost
   - Read-Only API (for paper trading initially)
   - Trusted IPs: Add `127.0.0.1`
5. Set Socket Port:
   - Paper: `7497`
   - Live: `7496`
6. **Important:** Uncheck "Download open orders on connection"
7. Click **OK** and restart Gateway

### Headless Mode Configuration

Create configuration file: `~/Jts/jts.ini`

```ini
[IBGateway]
TradingMode=paper
Username=YOUR_USERNAME
PasswordEncrypted=YOUR_ENCRYPTED_PASSWORD
```

**Security Note:** Never commit credentials to git. Use environment variables or secret manager.

### Auto-Login Script (Optional)

For development only. **DO NOT use in production.**

```bash
#!/bin/bash
# ~/scripts/start-ibgw.sh

export IB_USERNAME="your_username"
export IB_PASSWORD="your_password"

~/Jts/ibgateway &
```

## Starting Gateway

### GUI Mode (Development)

```bash
# macOS
open -a "IB Gateway"

# Linux
~/Jts/ibgateway
```

### Headless Mode (Production)

```bash
# Using Xvfb (X Virtual Framebuffer)
sudo apt-get install xvfb  # Linux only

Xvfb :1 -screen 0 1024x768x24 &
export DISPLAY=:1
~/Jts/ibgateway &
```

### Docker (Recommended for Production)

```dockerfile
FROM ubuntu:22.04

# Install dependencies
RUN apt-get update && apt-get install -y \
    wget \
    xvfb \
    x11vnc \
    openjdk-11-jre \
    && rm -rf /var/lib/apt/lists/*

# Install IB Gateway
RUN wget https://download2.interactivebrokers.com/installers/ibgateway/latest-standalone/ibgateway-latest-standalone-linux-x64.sh \
    && chmod +x ibgateway-latest-standalone-linux-x64.sh \
    && ./ibgateway-latest-standalone-linux-x64.sh -q

# Start script
COPY start-ibgw.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/start-ibgw.sh

EXPOSE 7497 7496

CMD ["/usr/local/bin/start-ibgw.sh"]
```

## Verification

### Test Connection

```python
# test_connection.py
from ibapi.client import EClient
from ibapi.wrapper import EWrapper

class TestApp(EWrapper, EClient):
    def __init__(self):
        EClient.__init__(self, self)

    def nextValidId(self, orderId: int):
        print(f"Connected! Next order ID: {orderId}")
        self.disconnect()

app = TestApp()
app.connect("127.0.0.1", 7497, clientId=42)
app.run()
```

Expected output:
```
Connected! Next order ID: 1
```

### Check API Status

```bash
# Test socket connection
nc -zv 127.0.0.1 7497

# Expected: Connection to 127.0.0.1 7497 port [tcp/*] succeeded!
```

## Ports Reference

| Port | Environment | Description |
|------|-------------|-------------|
| 7497 | Paper       | Paper trading API |
| 7496 | Live        | Live trading API |
| 4001 | TWS Paper   | TWS paper trading |
| 4000 | TWS Live    | TWS live trading |

## Common Issues

### Issue: "Connection refused"

**Solution:**
1. Verify Gateway is running: `ps aux | grep java`
2. Check port configuration in Gateway settings
3. Ensure firewall allows localhost connections

### Issue: "Already connected"

**Solution:**
```bash
# Kill existing connections
pkill -f "ibgateway"
# Wait 10 seconds
sleep 10
# Restart Gateway
```

### Issue: "Authentication failed"

**Solution:**
1. Verify credentials in Gateway
2. Check if 2FA is enabled (requires manual login)
3. Ensure API access is enabled in account settings

### Issue: "Market data not available"

**Solution:**
1. Subscribe to market data in IBKR account portal
2. For paper trading, ensure paper account has data subscriptions
3. Check if market is open (US equities: 9:30 AM - 4:00 PM ET)

## Monitoring

### Health Check Script

```bash
#!/bin/bash
# check-ibgw.sh

PORT=7497
if nc -z 127.0.0.1 $PORT 2>/dev/null; then
    echo "IB Gateway is running on port $PORT"
    exit 0
else
    echo "IB Gateway is not responding on port $PORT"
    exit 1
fi
```

### Auto-Restart on Failure

```bash
# Add to crontab: crontab -e
*/5 * * * * /path/to/check-ibgw.sh || /path/to/start-ibgw.sh
```

## Security Best Practices

1. **Never commit credentials** to version control
2. Use **environment variables** or **secret manager** for credentials
3. Enable **Read-Only API** for paper trading
4. Restrict **Trusted IPs** to localhost only
5. Use **2FA** for live trading accounts
6. Rotate credentials regularly
7. Monitor API access logs

## Nexus Integration

### Configuration

Update `configs/paper.yaml`:

```yaml
ibkr:
  host: "127.0.0.1"
  port: 7497
  client_id: 42
  timeout_sec: 30
```

### Connection Test

```bash
# From nexus root
python -m py.nexus.test_ibkr_connection
```

## References

- [IBKR API Documentation](https://interactivebrokers.github.io/tws-api/)
- [IB Gateway Download](https://www.interactivebrokers.com/en/trading/ibgateway-stable.php)
- [TWS API Installation](https://interactivebrokers.github.io/tws-api/initial_setup.html)

## Support

- IBKR Support: https://www.interactivebrokers.com/en/support/
- Nexus Internal: See `#nexus-support` channel

---

**Last Updated:** 2025-01-09  
**Owner:** Nexus Platform Team  
**Review Cycle:** Quarterly

