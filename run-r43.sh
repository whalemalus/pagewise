#!/bin/bash
export ANTHROPIC_API_KEY="ah-fce5e55ced5c7f90cf3420a8c335be559f0d524525b5c6a2b8b5a82d6eab8ace"
export ANTHROPIC_BASE_URL="http://localhost:8090/anthropic"
cd /home/claude-user/pagewise
cat prompt-r43.txt | claude -p --max-turns 25 --dangerously-skip-permissions --bare --effort low
