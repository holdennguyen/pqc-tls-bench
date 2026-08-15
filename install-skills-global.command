#!/bin/bash
# Copies this repo's project skills into ~/.claude/skills for use in ANY Claude Code project.
cd "$(dirname "$0")"
mkdir -p "$HOME/.claude/skills"
cp -R .claude/skills/* "$HOME/.claude/skills/"
echo "Installed to ~/.claude/skills:"; ls "$HOME/.claude/skills"
