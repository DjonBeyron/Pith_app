# Страница-плеер: серая кошка и Пит рядом на ОДНОЙ раскадровке (две реплики Мии из демо /mascot/ — озвучка и метки рта оттуда же, лица Мии у кошки и соответствующие лица Пита).
# Все анимации считаются от времени кадра (не от CSS), чтобы видео получалось ровным: рот по меткам Rhubarb, усы, кивок головы, наклон, хвост, дыхание, моргание, зрачки.
# Использование: python3 gray_cat_video.py <папка_с_gray_cat.json> [<выходной.mp4>]. Без mp4 — только страница-плеер gray_cat_talk.html (пуск, пауза, покадрово, ползунок, скорость, звук).
# Для mp4 нужны node + playwright (кадры) и ffmpeg.
import base64, io, json, os, re, struct, subprocess, sys, wave
HERE = os.path.dirname(os.path.abspath(__file__)); out = sys.argv[1]; mp4 = sys.argv[2] if len(sys.argv) > 2 else None
sp = json.load(open(f'{out}/gray_cat.json', encoding='utf8'))
pit = json.load(open(f'{HERE}/../../src/features/scene/v2/sprites/mascot/kit.json', encoding='utf8'))      # Пит — рядом, на той же раскадровке

# ── реплики Мии из страницы демо (текст, озвучка, метки рта) ──
h = open(f'{HERE}/../../public/mascot/index.html', encoding='utf8').read(); i = h.index('LINES=[') + len('LINES='); depth = 0
for k in range(i, len(h)):
    depth += (h[k] == '[') - (h[k] == ']')
    if depth == 0: break
LINES = json.loads(h[i:k + 1]); pick = lambda t: next(l for l in LINES if l['text'] == t)
SAY = [(1.7, pick('I know.')), (3.75, pick("Hmm. Maybe. You're kind of funny."))]       # начало реплики, реплика
TOTAL, FPS, SR = 7.7, 30, 24000
ONLY_HTML = len(sys.argv) < 3

# ── звук: тишина + реплики в нужные моменты ──
buf = [0] * int(TOTAL * SR)
for start, l in SAY:
    w = wave.open(io.BytesIO(base64.b64decode(l['audio'].split(',')[1]))); n = w.getnframes(); pcm = struct.unpack('<%dh' % n, w.readframes(n)); o = int(start * SR)
    for j, v in enumerate(pcm): buf[o + j] = v
w = wave.open(f'{out}/gray_cat_speech.wav', 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(struct.pack('<%dh' % len(buf), *buf)); w.close()

# ── раскадровка: лицо по времени (имена лиц Мии), реплики с метками рта ──
FACES = [(0.0, 'base'), (0.9, 'pathos'), (1.7, 'smirk'), (2.85, 'roll'), (3.75, 'interest'), (4.85, 'smirk'), (6.0, 'pathos'), (6.9, 'base')]
TL = dict(total=TOTAL, fps=FPS, faces=FACES, lines=[dict(start=s, dur=l['dur'], cues=l['mouthCues'] if isinstance(l['mouthCues'], list) else json.loads(l['mouthCues']), text=l['text'], tr=l['tr']) for s, l in SAY])
page = open(f'{HERE}/gray_cat_video_page.html', encoding='utf8').read().replace('__SPRITE__', json.dumps(sp, ensure_ascii=False)).replace('__PIT__', json.dumps(pit, ensure_ascii=False)).replace('__TIMELINE__', json.dumps(TL, ensure_ascii=False))
open(f'{out}/gray_cat_video.html', 'w', encoding='utf8').write(page)
# плеер для просмотра: та же страница + звук внутри (по кнопке «звук»), открывается без параметров
audio = 'data:audio/wav;base64,' + base64.b64encode(open(f'{out}/gray_cat_speech.wav', 'rb').read()).decode()
open(f'{out}/gray_cat_talk.html', 'w', encoding='utf8').write(page.replace('<script>', f'<script>const AUDIO = "{audio}";\n', 1))
print('готово', f'{out}/gray_cat_talk.html')
if ONLY_HTML: sys.exit()

# ── кадры (playwright) и сборка (ffmpeg) ──
frames = f'{out}/frames'; os.makedirs(frames, exist_ok=True)
subprocess.run(['node', f'{HERE}/gray_cat_video_frames.cjs', f'{out}/gray_cat_video.html#cap', frames, str(FPS)], check=True)
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(FPS), '-i', f'{frames}/f_%04d.jpg', '-i', f'{out}/gray_cat_speech.wav', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
                '-crf', '18', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', mp4], check=True)
print('готово', mp4)
