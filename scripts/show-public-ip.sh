#!/usr/bin/env bash
# Run ON THE VPS (SSH). The printed IPv4 is what you use for DNS A record: german.noteify.us → this IP.
set -euo pipefail
echo "Public IPv4 (use this value for your A record, unless your host shows a different 'primary' IP in the panel):"
curl -fsS -4 --max-time 10 https://ifconfig.me/ip || curl -fsS -4 --max-time 10 https://api.ipify.org
echo
