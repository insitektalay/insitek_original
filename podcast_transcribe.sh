#!/usr/bin/env bash
set -euo pipefail

# ───────────── parameters ─────────────
URL="$1"
TITLE="$2"
PODCAST="$3"
PUBLISH_DATE="$4"

[ -z "$URL" ] && { echo "Usage: $0 <audio-url> <title> <podcast-name> <publish-date>" >&2; exit 1; }

# ─────────── download & transcribe ───────────
# Generate a unique ID for this file
ID=$(date +%s)
BASE="podcast_${ID}"           # common prefix
MP3="${BASE}.mp3"
TXT="${BASE}.txt"

# Download the audio
curl -L "$URL" -o "$MP3"

# Transcribe
cd whisper.cpp
./build/bin/whisper-cli -m models/ggml-base.en.bin \
        -f "../$MP3" -otxt -of "../$BASE"
cd ..

# ─────────── markers for Node ───────────
echo "FILE:${TXT}"          # path the server will read
echo "TITLE:${TITLE}"
echo "CHANNEL:${PODCAST}"
echo "PUBLISH:${PUBLISH_DATE}"
echo "♥ DONE"