#!/usr/bin/env python3
"""Реплика для стенда сравнения ?scene=cmp (src/features/scene/v2/stand): настоящая речь из демо public/mascot/index.html.

В демо маскотов (scripts/mascot, озвучка Kokoro + Rhubarb) каждая реплика лежит как WAV в base64 и с метками рта Rhubarb (mouthCues).
Берём реплику «I like your bow. It's really nice!» и кладём:
  public/scene-cmp/pit-line.wav   — звук (24 кГц, моно);
  public/scene-cmp/pit-line.json  — { text, durationSec, words: [{ word, start, end }] }.
Тайминги слов ПРИБЛИЗИТЕЛЬНЫЕ (это не ElevenLabs): предложения делятся по длинной паузе Rhubarb (≥ 0,15 с), внутри предложения слова
раскладываются по весам (буквы + 1) с небольшой паузой в конце слота — тем же приёмом, что mouthRhythm.syntheticTimings.
Свой файл со своими таймингами стенд берёт из адреса: ?scene=cmp&audio=<url>&text=<текст>&words=<url json>.
Запуск из корня проекта: python3 scripts/scene-cmp/make_demo_line.py
"""
import base64
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LINE_INDEX = 2        # «I like your bow. It's really nice!» — мужской голос, без имён собеседников
GAP_SHARE = 0.12      # доля слота слова под паузу после него
LONG_PAUSE = 0.15     # пауза Rhubarb (X) не короче — граница предложений, с

src = (ROOT / 'public/mascot/index.html').read_text(encoding='utf8')
start = src.index('LINES=[') + len('LINES=')
lines, _ = json.JSONDecoder().raw_decode(src[start:])
line = lines[LINE_INDEX]

wav = base64.b64decode(line['audio'].split(',', 1)[1])
out_dir = ROOT / 'public/scene-cmp'
out_dir.mkdir(exist_ok=True)
(out_dir / 'pit-line.wav').write_bytes(wav)

# Звучащие куски: между длинными паузами Rhubarb
cues = line['mouthCues']
chunks, cur = [], None
for a, b, c in cues:
    if c != 'X':
        cur = [a, b] if cur is None else [cur[0], b]
    elif cur is not None and b - a >= LONG_PAUSE:
        chunks.append(cur)
        cur = None
if cur is not None:
    chunks.append(cur)

# Предложения по знакам конца
text = line['text']
sentences = [s.strip() for s in re.findall(r'[^.!?]+[.!?]+', text)]
if len(sentences) != len(chunks):
    # Не сошлось (другая реплика) — одно звучащее окно на всю реплику
    sentences = [text]
    chunks = [[chunks[0][0], chunks[-1][1]]]

words = []
for sent, (t0, t1) in zip(sentences, chunks):
    ws = sent.split()
    weights = [len(re.sub(r'[^A-Za-zА-Яа-яЁё0-9]', '', w)) + 1 for w in ws]
    total = sum(weights)
    at = t0
    for w, k in zip(ws, weights):
        slot = (t1 - t0) * k / total
        words.append({'word': w, 'start': round(at, 2), 'end': round(at + slot * (1 - GAP_SHARE), 2)})
        at += slot

meta = {
    'text': text,
    'durationSec': round(line['dur'], 3),
    'words': words,
    'note': 'речь — Kokoro TTS из демо /mascot/, тайминги слов приблизительные (по паузам Rhubarb и весам слов), не ElevenLabs',
}
(out_dir / 'pit-line.json').write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding='utf8')
print(len(wav), 'байт WAV;', len(words), 'слов;', words[0], words[-1])
