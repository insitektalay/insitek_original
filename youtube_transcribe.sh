#!/usr/bin/env bash
set -euo pipefail

# ───────────── parameters ─────────────
URL="$1"
[ -z "$URL" ] && { echo "Usage: $0 <youtube-url>" >&2; exit 1; }

# ─────────── metadata (separate yt-dlp calls for safety) ───────────
echo "STAGE:Extracting metadata"
echo "PROGRESS:5"

# Extract each field separately to avoid delimiter issues
# Note: We use uploader_id (like @TheDavidLinReport) as it's the only reliable field
# The uploader and channel fields often contain guest names from video titles
ID="$(yt-dlp -s --cookies-from-browser chrome --print "%(id)s" "$URL")"
TITLE_RAW="$(yt-dlp -s --cookies-from-browser chrome --print "%(title)s" "$URL")"
UPLOADER_ID="$(yt-dlp -s --cookies-from-browser chrome --print "%(uploader_id)s" "$URL")"
CHANNEL_ID="$(yt-dlp -s --cookies-from-browser chrome --print "%(channel_id)s" "$URL")"
UPLOAD="$(yt-dlp -s --cookies-from-browser chrome --print "%(upload_date,release_date)s" "$URL")"

# Extract channel name from uploader_id by removing @ symbol
CHANNEL_RAW="${UPLOADER_ID#@}"

# Map known channel IDs to display names
case "$CHANNEL_RAW" in
  "TheDavidLinReport")
    CHANNEL="David Lin"
    ;;
  *)
    # For unknown channels, try to convert CamelCase to spaces
    # This is a simple approach that works for most cases
    CHANNEL=$(echo "$CHANNEL_RAW" | sed 's/\([A-Z]\)/ \1/g' | sed 's/^  *//')
    ;;
esac

# Trim whitespace from title and channel
TITLE="$(printf '%s' "$TITLE_RAW" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')"
CHANNEL="$(printf '%s' "$CHANNEL" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')"

BASE="yt_${ID}"           # common prefix
MP3="${BASE}.mp3"
TXT="${BASE}.txt"

# Convert YYYYMMDD to YYYY-MM-DD (or leave blank if invalid)
UPLOAD_ISO=""
if [ -n "$UPLOAD" ] && printf '%s' "$UPLOAD" | grep -qE '^[0-9]{8}$'; then
  UPLOAD_ISO="$(printf '%s' "$UPLOAD" | sed -E 's#^([0-9]{4})([0-9]{2})([0-9]{2})$#\1-\2-\3#')"
fi

echo "PROGRESS:10"

# ─────────── download & transcribe ───────────
echo "STAGE:Downloading audio"
echo "PROGRESS:10"

# Heartbeat function to keep progress updates flowing
last_progress=10

# Function to cleanly stop heartbeat
cleanup_heartbeat() {
  if [ ! -z "$HEARTBEAT_PID" ]; then
    kill $HEARTBEAT_PID 2>/dev/null || true
    wait $HEARTBEAT_PID 2>/dev/null || true
  fi
}

# Trap to ensure cleanup
trap cleanup_heartbeat EXIT INT TERM

# Start heartbeat in background
(
  while sleep 5; do
    echo "HEARTBEAT:$last_progress"
  done
) &
HEARTBEAT_PID=$!

yt-dlp --extract-audio --audio-format mp3 --audio-quality 0 \
       --cookies-from-browser chrome \
       --force-overwrites -o "$MP3" \
       --newline --progress \
       "$URL" 2>&1 | while IFS= read -r line; do
  # Look for actual download progress
  if [[ "$line" =~ \[download\].*([0-9]+(\.[0-9]+)?)% ]]; then
    download_pct="${BASH_REMATCH[1]}"
    download_int=$(printf "%.0f" "$download_pct")
    # Map real download progress (0-100%) to our range (10-30%)
    overall_pct=$((10 + (download_int * 20 / 100)))
    echo "PROGRESS:$overall_pct"
    last_progress=$overall_pct
  elif [[ "$line" =~ \[download\] ]]; then
    # If we see download activity but no percentage, show some progress
    echo "PROGRESS:15"
    last_progress=15
  fi
done

# Kill heartbeat after download
cleanup_heartbeat

echo "PROGRESS:30"
echo "STAGE:Transcribing audio"

# Transcribe with line-by-line progress tracking
cd whisper.cpp

# Track progress by counting output lines (more reliable than parsing)
line_count=0
./build/bin/whisper-cli -m models/ggml-base.en.bin \
        -f "../$MP3" -otxt -oj -of "../$BASE" 2>&1 | while IFS= read -r line; do
  echo "DEBUG:whisper: $line"
  
  # Increment for any substantial output line
  if [[ "$line" =~ ^[^[:space:]] ]] && [[ ! "$line" =~ ^$ ]]; then
    line_count=$((line_count + 1))
    # Show progress every few lines to avoid spam
    if [ $((line_count % 3)) -eq 0 ]; then
      # Estimate progress based on line count (cap at reasonable number)
      progress_pct=$((line_count * 2))  # 2% per 3 lines
      if [ $progress_pct -gt 100 ]; then
        progress_pct=100
      fi
      # Map to our range (30-85%)
      overall_pct=$((30 + (progress_pct * 55 / 100)))
      echo "PROGRESS:$overall_pct"
    fi
  fi
  
  # Also look for any explicit progress indicators
  if [[ "$line" =~ ([0-9]+)% ]]; then
    whisper_pct="${BASH_REMATCH[1]}"
    overall_pct=$((30 + (whisper_pct * 55 / 100)))
    echo "PROGRESS:$overall_pct"
  fi
done
cd ..

echo "PROGRESS:90"
echo "STAGE:Saving to database"
echo "PROGRESS:95"

# ─────────── markers for Node ───────────
echo "FILE:${TXT}"          # path the server will read
echo "JSON:${BASE}.json"     # path to JSON with timestamps
echo "TITLE:${TITLE}"
echo "CHANNEL:${CHANNEL}"
echo "CHANNEL_ID:${CHANNEL_ID}"
echo "PUBLISH:${UPLOAD_ISO}"
echo "PROGRESS:100"
echo "♥ DONE"

# Final cleanup is handled by trap, but call it explicitly for good measure
cleanup_heartbeat

# Exit successfully
exit 0