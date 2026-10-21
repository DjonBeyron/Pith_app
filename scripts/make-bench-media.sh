#!/usr/bin/env bash
# Медиа стенда «медиа в чате» (e2e/chat-media/media): синтетические файлы через ffmpeg. Файлы лежат в git (≈440 КБ),
# скрипт — чтобы пересобрать, если понадобится другой размер/длительность. Запуск: scripts/make-bench-media.sh
set -euo pipefail
cd "$(dirname "$0")/../e2e/chat-media/media"
ffmpeg -loglevel error -y -f lavfi -i "sine=frequency=440:duration=3" -ac 1 -b:a 48k a1.mp3
ffmpeg -loglevel error -y -f lavfi -i "sine=frequency=660:duration=2" -ac 1 -b:a 48k a2.mp3
ffmpeg -loglevel error -y -f lavfi -i "testsrc=size=480x480:rate=24:duration=2" -pix_fmt yuv420p -c:v libvpx -b:v 300k circle.webm
ffmpeg -loglevel error -y -f lavfi -i "testsrc2=size=640x360:rate=24:duration=2" -pix_fmt yuv420p -c:v libvpx -b:v 350k video.webm
ffmpeg -loglevel error -y -f lavfi -i "smptebars=size=320x320:rate=24:duration=1.5" -pix_fmt yuv420p -c:v libvpx -b:v 250k sticker.webm
ffmpeg -loglevel error -y -f lavfi -i "testsrc=size=2400x1800" -frames:v 1 -q:v 3 photo.jpg   # большое фото: декодирование заметно
ffmpeg -loglevel error -y -f lavfi -i "rgbtestsrc=size=512x512" -frames:v 1 sticker.png
for i in 1 2 3; do ffmpeg -loglevel error -y -f lavfi -i "testsrc2=size=800x600" -frames:v 1 -q:v 5 "pc$i.jpg"; done
ls -la
