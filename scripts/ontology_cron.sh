#!/bin/bash
# Cron wrapper for ontology edge refresh pipeline
# Add to crontab: 0 6 * * * /path/to/nexus/scripts/ontology_cron.sh

set -e

# Change to project directory
cd "$(dirname "$0")/.."

# Load environment
if [ -f ".env.ontology" ]; then
    export $(cat .env.ontology | grep -v '^#' | xargs)
fi

# Run pipeline
python3 py/nexus/ops/refresh_edges.py >> logs/ontology_refresh.log 2>&1

# Exit with pipeline status
exit $?

