import sys, os, pickle, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vec_tail import *
sp = pickle.load(open('/tmp/spines.pkl', 'rb'))
def render(Q, w, SS=3, UP=2):
    k = SS * UP
    big = Image.new('RGBA', (W * k, H * k), (0, 0, 0, 0)); d = ImageDraw.Draw(big)
    # плотная кривая через Catmull-Rom
    t = np.linspace(0, len(Q) - 1, len(Q) * 6); x = np.interp(t, range(len(Q)), Q[:, 0]); y = np.interp(t, range(len(Q)), Q[:, 1])
    for r, col in ((w / 2, LINE), (w / 2 - OUTW, FILL)):
        for a, b in zip(x, y): d.ellipse([(a - r) * k, (b - r) * k, (a + r) * k, (b + r) * k], fill=col + (255,))
    return big.resize((W * UP, H * UP), Image.LANCZOS)
if __name__ == '__main__':
    miaU = mia.resize((W * 2, H * 2), Image.LANCZOS)
    sh = Image.new('RGB', (3 * 440, 3 * 390), (60, 56, 80))
    for i, s in enumerate(sp):
        v = Image.new('RGBA', (W * 2, H * 2), (60, 56, 80, 255)); v.alpha_composite(render(s['q'], s['w'])); v.alpha_composite(miaU)
        sh.paste(v.convert('RGB').resize((440, 390)), ((i % 3) * 440, (i // 3) * 390))
    sh.save('/tmp/spine_sheet.png')
