#!/bin/bash
# Start AgentRouter Proxy Bridge in background or foreground
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "=================================================="
echo " Starting AgentRouter Proxy Bridge on Port 8318..."
echo "=================================================="

python3 agentrouter-proxy.py
