#!/bin/bash
# Development helper script - starts all services

set -e

echo "Starting Nexus development environment..."

# Check if tmux is available
if command -v tmux &> /dev/null; then
    echo "Using tmux for session management"
    
    # Create new tmux session
    tmux new-session -d -s nexus
    
    # Window 0: Observability API
    tmux rename-window -t nexus:0 'API'
    tmux send-keys -t nexus:0 'python -m ops.observability_api.main' C-m
    
    # Window 1: UI
    tmux new-window -t nexus:1 -n 'UI'
    tmux send-keys -t nexus:1 'cd ui/observatory && pnpm dev' C-m
    
    # Window 2: Logs
    tmux new-window -t nexus:2 -n 'Logs'
    tmux send-keys -t nexus:2 'tail -f logs/*.log 2>/dev/null || echo "No logs yet"' C-m
    
    # Attach to session
    echo ""
    echo "Services started in tmux session 'nexus'"
    echo ""
    echo "Commands:"
    echo "  tmux attach -t nexus  - Attach to session"
    echo "  tmux kill-session -t nexus  - Stop all services"
    echo ""
    
    tmux attach -t nexus
else
    echo "tmux not found. Starting services in background..."
    
    # Start API in background
    python -m ops.observability_api.main &
    API_PID=$!
    echo "API started (PID: $API_PID)"
    
    # Start UI in background
    cd ui/observatory
    pnpm dev &
    UI_PID=$!
    cd ../..
    echo "UI started (PID: $UI_PID)"
    
    # Save PIDs
    echo $API_PID > /tmp/nexus_api.pid
    echo $UI_PID > /tmp/nexus_ui.pid
    
    echo ""
    echo "Services started"
    echo "  API: http://localhost:9400"
    echo "  UI: http://localhost:3000"
    echo ""
    echo "To stop: ./scripts/stop.sh"
fi

