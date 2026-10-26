# Озвучка истории: текст реплик (story_script.json) → голос (Kokoro, английский) → разметка рта (Rhubarb) → work/story.json для make_story.mjs.
# Разметка рта = формы Rhubarb (какой звук) × огибающая громкости (когда рот реально открыт): паузы между словами закрывают рот, слоги «дышат».
# Нужны: pip install kokoro-onnx soundfile; файлы модели Kokoro (KOKORO_MODEL, KOKORO_VOICES) и бинарник Rhubarb Lip Sync (RHUBARB).
# Использование: python3 tts_story.py <work>   →   work/story.json (реплики с base64-озвучкой, формами рта и окнами состояний)
import base64, json, math, os, struct, subprocess, sys, wave
work = sys.argv[1]
script = json.load(open(os.path.join(os.path.dirname(__file__), 'story_script.json'), encoding='utf8'))

def mouth_cues(wav_path, cues):
    w = wave.open(wav_path); n = w.getnframes(); sr = w.getframerate()
    x = struct.unpack('<%dh' % n, w.readframes(n)); step = int(sr * 0.02)
    env = [math.sqrt(sum(v * v for v in x[i:i + step]) / step) for i in range(0, n - step, step)]
    m = max(env); env = [e / m for e in env]
    def base(t):
        for c in cues:
            if c['start'] <= t < c['end']: return c['value']
        return 'X'
    frames = []
    for i, a in enumerate(env):
        b = base(i * 0.02 + 0.01)
        frames.append('X' if a < 0.10 else 'C' if b == 'X' else (b if a > 0.40 else 'B') if b in 'CDE' else b)
    segs = []
    for i, s in enumerate(frames):
        if segs and segs[-1][2] == s: segs[-1][1] = i * 0.02 + 0.02
        else: segs.append([i * 0.02, i * 0.02 + 0.02, s])
    res = []
    for s in segs:      # слишком короткие куски (< 40 мс) вливаем в предыдущий
        if res and (s[1] - s[0]) < 0.04 and s[2] != 'X': res[-1][1] = s[1]
        elif res and res[-1][2] == s[2]: res[-1][1] = s[1]
        else: res.append(s[:])
    res[-1][1] = max(res[-1][1], n / sr)
    return [[round(a, 3), round(b, 3), v] for a, b, v in res], n / sr

def main():
    import soundfile as sf
    from kokoro_onnx import Kokoro
    k = Kokoro(os.environ['KOKORO_MODEL'], os.environ['KOKORO_VOICES'])
    lines = []
    for i, l in enumerate(script['lines']):
        wav = f'{work}/l{i}.wav'; txt = f'{work}/l{i}.txt'
        s, sr = k.create(l['text'].replace('...', '…'), voice=l['voice'], speed=l['speed'], lang='en-us'); sf.write(wav, s, sr)
        open(txt, 'w').write(l['text'].replace('...', ''))
        subprocess.run([os.environ['RHUBARB'], '-f', 'json', '-d', txt, '-o', f'{work}/l{i}.json', wav], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        cues, dur = mouth_cues(wav, json.load(open(f'{work}/l{i}.json'))['mouthCues'])
        lines.append({'who': l['who'], 'name': l['name'], 'text': l['text'], 'tr': l['tr'], 'dur': dur + 0.15, 'mouthCues': cues,
                      'tail': '24%' if l['who'] == 'a' else '70%', 'audio': 'data:audio/wav;base64,' + base64.b64encode(open(wav, 'rb').read()).decode()})
    json.dump({'title': script['title'], 'lines': lines, 'windows': script['windows']}, open(f'{work}/story.json', 'w', encoding='utf8'), ensure_ascii=False)
    print('реплик:', len(lines), '→', f'{work}/story.json')

if __name__ == '__main__': main()
