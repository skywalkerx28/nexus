#!/bin/bash
# Stop development services

echo "Stopping Nexus services..."

# Check for tmux session
if tmux has-session -t nexus 2>/dev/null; then
    tmux kill-session -t nexus
    echo "Stopped tmux session"
else
    # Kill by PID files
    if [ -f /tmp/nexus_api.pid ]; then
        kill $(cat /tmp/nexus_api.pid) 2>/dev/null || true
        rm /tmp/nexus_api.pid
        echo "Stopped API"
    fi
    
    if [ -f /tmp/nexus_ui.pid ]; then
        kill $(cat /tmp/nexus_ui.pid) 2>/dev/null || true
        rm /tmp/nexus_ui.pid
        echo "Stopped UI"
    fi
fi

# Cleanup any remaining processes
pkill -f "observability_api.main" 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true

echo "All services stopped"

