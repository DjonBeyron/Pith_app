#!/usr/bin/env bash
# Сборка маскотов: дизайнерский .ai → риг кота → пакеты персонажей (кот Кит, кошка Мия) → спрайты конструктора сцен + страница-история public/mascot/index.html
# Использование: WORK=/tmp/mascot-work STORY=/путь/story.json bash scripts/mascot/run.sh   (STORY — озвучка из tts_story.py; без неё берётся work/story.json)
# Нужны: python3 с pymupdf, fonttools, skia-pathops; node 22. Запускать из корня проекта. Не запускать параллельно: каждый шаг тяжёлый по процессору.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; WORK="${WORK:-/tmp/mascot-work}"; mkdir -p "$WORK"; cd "$HERE"
python3 export_layers.py source/cat.ai "$WORK"        # слои .ai → SVG (глаза открыты / закрыты)
python3 build_rig.py "$WORK"                          # риг кота: тело, голова, глаза, 9 форм рта; старый хвост убран
node finalize_rig.mjs "$WORK"                         # хвост кота (tail.mjs) вставляется в позу покоя
python3 optimize_rig.py "$WORK"                       # запечь клипы и transform, склеить контуры, рот → таблица форм
python3 fix_paw.py "$WORK"                            # палец на правой задней лапе (как у левой)
for s in base roll smirk pathos sneer interest; do    # девочка: по одной сборке на состояние мимики
  EXPR=$s PUPIL_H=20 python3 build_girl.py "$WORK" "_st_$s"
done
python3 make_packs.py "$WORK"                         # пакеты персонажей (pack_boy.json, pack_girl.json) + облегчение разметки
node export_sprites.mjs "$WORK"                       # пакеты → спрайты конструктора сцен (src/features/scene/v2/sprites/mascot/{kit,mia}.json)
node bake_avatar.mjs "$WORK/pit.png"                      # аватарка Пита для шапки чата (PNG) …
python3 -c "from PIL import Image; Image.open('$WORK/pit.png').convert('RGB').save('../../src/shared/assets/pitAvatar.webp', 'WEBP', quality=82, method=6)"   # … → WebP ≈ 3 КБ
[ -n "${STORY:-}" ] && cp "$STORY" "$WORK/story.json"
node make_story.mjs "$WORK" "$HERE/../../public/mascot/index.html" "$WORK/story.json"
