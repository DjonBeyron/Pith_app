# Все маскоты в ряд на одном холсте, без анимации (обычное лицо, с бровями): Пит, Кетти (прежняя Мия) и Мия — для сравнения рисунка.
# Использование: python3 gray_cat_lineup.py <папка_с_gray_cat.json (Мия)> <выход.html>; картинку снимает gray_cat_lineup.cjs.
import json, sys, os
HERE = os.path.dirname(os.path.abspath(__file__)); d1, out = sys.argv[1:3]
M = f'{HERE}/../../src/features/scene/v2/sprites/mascot'
L = lambda p: json.load(open(p, encoding='utf8'))
cats = [('Пит', L(f'{M}/kit.json')), ('Кетти (прежняя Мия)', L(f'{M}/mia.json')), ('Мия', L(f'{d1}/gray_cat.json'))]
page = '''<!doctype html><html><head><meta charset="utf-8"><title>Маскоты рядом</title><style>html,body{margin:0;background:#a7acba;font-family:system-ui,Arial,sans-serif}svg{display:block}</style></head><body>
<svg id="s" xmlns="http://www.w3.org/2000/svg" width="1800" height="940" viewBox="0 0 1800 940"></svg><script>
const CATS = %s, NS = 'http://www.w3.org/2000/svg', s = document.getElementById('s'); let x = 0;
const el = (t, p, a = {}) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); p.append(e); return e };
CATS.forEach(([label, sp], i) => {
  const g = el('g', s), tail = el('g', g, { transform: `translate(${sp.tailBase[0]} ${sp.tailBase[1]})` }), body = el('g', g), head = el('g', g);
  tail.innerHTML = sp.tail; body.innerHTML = sp.body; head.innerHTML = sp.head.replace('<g class="brows"></g>', '<g class="brows">' + sp.states.base.brows + '</g>') + '<g>' + sp.states.base.eyes + '</g>';
  const b = g.getBBox(), cx = 300 + i * 600, sc = 0.88;                                  // одинаковый масштаб у всех: размеры честные
  g.setAttribute('transform', `translate(${cx - (b.x + b.width / 2) * sc} ${820 - (b.y + b.height) * sc}) scale(${sc})`);
  const sh = el('ellipse', s, { cx, cy: 826, rx: 210, ry: 18, fill: '#2b2133', opacity: .18 }); s.insertBefore(sh, g);
  const t = el('text', s, { x: cx, y: 890, 'text-anchor': 'middle', 'font-size': 32, 'font-weight': 700, fill: '#2b2133' }); t.textContent = label;
});
</script></body></html>''' % json.dumps([[l, sp] for l, sp in cats], ensure_ascii=False)
open(out, 'w', encoding='utf8').write(page); print('готово', out)
