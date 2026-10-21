#!/bin/bash
# Refreshes the progress board every REFRESH_SECONDS (default 60): state.js is rebuilt from the round files, builds and gate
# results on disk, so feedback the reviewer writes shows up without anyone calling st. --no-bump leaves updatedAt alone (the
# board's "last report" time reads it). It stops by itself when the run is done (phase "done" in state.json) or team/ is gone.
cd "$(dirname "$0")" || exit 1
while [ -f ../state.json ]; do
  grep -q '"phase": *"done"' ../state.json && exit 0
  sh ./st touch --no-bump >/dev/null 2>&1 || true
  sleep "${REFRESH_SECONDS:-60}"
done
