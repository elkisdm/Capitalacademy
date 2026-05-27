#!/bin/bash
# optimize-videos.sh
#
# Comprime videos usando Apple VideoToolbox (hardware acceleration).
# M5 debería procesar ~50-100x realtime.
#
# Uso: bash scripts/optimize-videos.sh

INPUT_DIR="$HOME/Downloads"
OUTPUT_DIR="$HOME/Downloads/optimized"

mkdir -p "$OUTPUT_DIR"

FILES=(
  "MasterClass Gonzalez-001.mp4"
  "MasterClass Matamala-002.mp4"
  "MasterClass Magner-003.mp4"
  "MasterClass Raul Cortez-005.mp4"
)

for FILE in "${FILES[@]}"; do
  INPUT="$INPUT_DIR/$FILE"
  CLEAN_NAME=$(echo "$FILE" | sed 's/-[0-9]*\.mp4$/.mp4/')
  OUTPUT="$OUTPUT_DIR/$CLEAN_NAME"

  if [ ! -f "$INPUT" ]; then
    echo "⏭️  No encontrado: $FILE"
    continue
  fi

  if [ -f "$OUTPUT" ]; then
    SIZE=$(du -h "$OUTPUT" | cut -f1)
    echo "⏭️  Ya existe: $CLEAN_NAME ($SIZE)"
    continue
  fi

  SIZE_BEFORE=$(du -h "$INPUT" | cut -f1)
  echo ""
  echo "🎬 Optimizando: $FILE ($SIZE_BEFORE)"
  echo "   → $OUTPUT"
  echo "   Encoder: h264_videotoolbox (Apple M5 hardware)"
  START=$(date +%s)

  ffmpeg -i "$INPUT" \
    -c:v h264_videotoolbox \
    -q:v 65 \
    -profile:v high \
    -vf "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease" \
    -c:a aac \
    -b:a 128k \
    -ac 2 \
    -movflags +faststart \
    -y \
    "$OUTPUT" 2>&1 | tail -1

  END=$(date +%s)
  ELAPSED=$((END - START))

  if [ $? -eq 0 ] && [ -f "$OUTPUT" ]; then
    SIZE_AFTER=$(du -h "$OUTPUT" | cut -f1)
    echo "   ✅ $CLEAN_NAME: $SIZE_BEFORE → $SIZE_AFTER (${ELAPSED}s)"
  else
    echo "   ❌ Error procesando $FILE"
  fi
done

echo ""
echo "============================================"
echo "📋 Archivos optimizados:"
echo "============================================"
ls -lh "$OUTPUT_DIR"/*.mp4 2>/dev/null
echo ""
echo "Siguiente: npx tsx scripts/upload-local-to-mux.ts"
