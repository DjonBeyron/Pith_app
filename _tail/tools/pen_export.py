import sys, os, pickle, numpy as np
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from vec_tail import *
pen = pickle.load(open('/tmp/pen.pkl', 'rb')); old = pickle.load(open('/tmp/vec_frames.pkl', 'rb'))
frames, marks, spans = [], [], []
for k in range(9):
    S = pen[k]['S']; ms = list(old[k]['polys'])
    if k == 3: ms += [taper([(x - 3.0, y) for x, y in p]) for p in RED4]   # контур хвоста стал чище и ближе к дугам: отодвигаем дуги ещё на 3 px
    if k == 4: ms += [taper(p) for p in lines5(S)]
    frames.append({'pose': k, 'a': 0.0, 'S': S, 'segs': [tuple(c) for c in pen[k]['segs']]}); marks.append(ms)
    if not ms: spans.append(0); continue
    img = Image.new('L', (W, H), 0); dm = ImageDraw.Draw(img)
    for m in ms: dm.polygon([tuple(p) for p in np.asarray(m)], fill=255)
    dist = ndi.distance_transform_edt(np.array(img) == 0); g = float(dist[S & ~bodyA].min())
    spans.append(1 if g >= 3.5 else 0); print('кадр', k + 1, 'зазор штрихи–хвост', round(g, 1))
pickle.dump({'cuts': [], 'frames': frames, 'spans': spans, 'marks': marks}, open('/tmp/morph.pkl', 'wb'))
print('окна штрихов', spans)
