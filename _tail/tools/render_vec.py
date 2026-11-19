import sys, os, pickle, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vec_tail import *
UP = 2; SS = 3
def frame_layers(f):
    """(полигоны меток, контур хвоста) с учётом правок кадров"""
    return f
def raster(f, extra_marks=()):
    k = UP * SS
    big = Image.new('RGBA', (W * k, H * k), (0, 0, 0, 0)); d = ImageDraw.Draw(big)
    pts = sample(f['segs']) * k
    # обводка: линия по контуру толщиной OUTW, затем заливка внутри
    d.polygon([tuple(p) for p in pts], fill=FILL + (255,))
    d.line([tuple(p) for p in pts] + [tuple(pts[0])], fill=LINE + (255,), width=int(round(OUTW * k)), joint='curve')
    # скруглить стыки обводки кружками
    r = OUTW * k / 2
    for p in pts[::2]: d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=LINE + (255,))
    # внутренняя заливка поверх половины обводки внутрь уже есть (линия по центру контура): добавим заливку, ужатую на r — не нужно, линия делит поровну
    for poly in list(f['polys']) + list(extra_marks):
        d.polygon([tuple(p * k) for p in poly], fill=MARK + (235,))
    return big
def compose(f, extra=()):
    big = raster(f, extra)
    # заливка: линия центровая -> внутренняя половина обводки лежит ВНУТРИ силуэта; тот же эффект у игры (stroke по пути)
    return big.resize((W * UP, H * UP), Image.LANCZOS)
if __name__ == '__main__':
    fr = pickle.load(open('/tmp/vec_frames.pkl', 'rb'))
    miaU = mia.resize((W * UP, H * UP), Image.LANCZOS)
    os.makedirs('vview', exist_ok=True)
    for i, f in enumerate(fr):
        extra = []
        if i == 3: extra = [taper(p) for p in RED4]
        if i == 4: extra = [taper(p) for p in lines5(f['tail'])]
        t = compose(f, extra)
        v = Image.new('RGBA', t.size, (0, 0, 0, 0)); v.alpha_composite(t); v.alpha_composite(miaU); v.save(f'vview/f{i+1}.png')
    ims = [Image.open(f'vview/f{i}.png') for i in range(1, 10)]
    cw, ch = 440, 390; sh = Image.new('RGB', (cw * 3, ch * 3), (60, 56, 80))
    for i, im in enumerate(ims):
        bg = Image.new('RGBA', im.size, (60, 56, 80, 255)); bg.alpha_composite(im); sh.paste(bg.convert('RGB').resize((cw, ch)), ((i % 3) * cw, (i // 3) * ch))
    sh.save('/tmp/vsheet.png')
