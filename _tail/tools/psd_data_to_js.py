# JSON из psd_to_data.py → src/features/pitrace/mia/miaTailData.js (шапка файла сохраняется, меняются только данные кадров и штрихов).
# Запуск: python3 _tail/tools/psd_to_data.py PSD frames.json && python3 _tail/tools/psd_data_to_js.py frames.json src/features/pitrace/mia/miaTailData.js
import sys, json
frames = json.load(open(sys.argv[1])); OUT = sys.argv[2]
head = open(OUT, encoding='utf-8').read().split('export const TAIL_SLOTS')[0]
lines = [head + 'export const TAIL_SLOTS = 9', 'export const MIA_TAIL_FRAMES = [']
lines += ["  { s: %d, n: 1, d: '%s' }," % (i, f['tail']) for i, f in enumerate(frames)]
lines += [']', 'export const MIA_TAIL_MARKS = [']
lines += ["  { s: %d, n: 1, d: '%s' }," % (i, f['marks']) for i, f in enumerate(frames) if f['marks']]
lines += [']']
open(OUT, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
