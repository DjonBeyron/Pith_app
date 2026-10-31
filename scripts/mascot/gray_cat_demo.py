# Страница-превью серой кошки: рот из девяти форм (X A B C D E F G H) с языком и зубами, усы качаются при речи, кивок головы, хвост, моргание.
# Правила анимации те же, что у «живого Пита v2» (scene-v2-pit.css, scene-v2-cat.css): усы вращаются вокруг корня у морды, широкие формы D/E чуть увеличивают рот,
# язык в D вытягивается. Использование: python3 gray_cat_demo.py <папка_с_gray_cat.json> → gray_cat_demo.html рядом (самодостаточный файл).
import json, sys, os
out = sys.argv[1]
sp = json.load(open(f'{out}/gray_cat.json', encoding='utf8'))
bx, by = sp['tailBase']
svg = (f'<svg id="cat" xmlns="http://www.w3.org/2000/svg" viewBox="42 41 586 699">'
       f'<g class="cat-tail" transform="translate({bx} {by})"><g class="tail-sway">{sp["tail"]}</g></g>'
       f'<g class="cat-body">{sp["body"]}</g>'
       f'<g class="cat-head" data-vis="X"><g class="mx-tilt">{sp["head"]}<g class="cat-eyes">{sp["states"]["base"]["eyes"]}</g></g></g></svg>')
CSS = '''
:root { color-scheme: light dark; --bg: #f5f3ef; --fg: #26252e; }
@media (prefers-color-scheme: dark) { :root { --bg: #1d1c24; --fg: #ece9f2; } }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; }
#wrap { width: min(92vw, 520px); padding: 12px 16px 0; box-sizing: border-box; }
#cat { width: 100%; height: auto; display: block; }
.bar { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; padding: 8px 16px 20px; max-width: 560px; }
button { font: inherit; padding: 6px 12px; border-radius: 8px; border: 1px solid #8884; background: #8881; color: inherit; cursor: pointer; }
button.on { background: #e2457c; color: #fff; border-color: #e2457c; }
.hint { opacity: .65; font-size: 13px; text-align: center; padding: 0 16px 8px; }
/* рот и язык — как scene-v2-pit.css */
.mouth { transform-box: fill-box; transform-origin: 50% 10%; transition: scale 80ms ease-out; }
[data-vis="D"] .mouth, [data-vis="E"] .mouth { scale: 1.18; }
.mt { transform-box: fill-box; transform-origin: 50% 0; }
[data-vis="D"] .mt { scale: 1.2; }
/* усы — вокруг корня у морды (левые — правый край, правые — левый) */
.wh { transform-box: fill-box; }
.wh-l { transform-origin: 100% 50%; } .wh-r { transform-origin: 0 50%; }
@keyframes whL { 0%, 100% { rotate: 4deg; } 50% { rotate: -3deg; } }
@keyframes whR { 0%, 100% { rotate: -4deg; } 50% { rotate: 3deg; } }
.talking .wh-l { animation: whL .6s ease-in-out infinite; } .talking .wh-r { animation: whR .6s ease-in-out infinite; }
.talking .wh-d { animation-duration: .72s; animation-delay: -.25s; }
/* кивок головы и хвост */
.cat-head { transform-box: fill-box; transform-origin: 50% 85%; }
@keyframes nod { 0%, 100% { transform: rotate(-0.4deg) translateY(0); } 50% { transform: rotate(0.4deg) translateY(-2px); } }
.talking .cat-head { animation: nod .9s ease-in-out infinite; }
.cat-tail { transform-origin: 0 0; transform-box: view-box; }
.tail-sway { transform-origin: 0 0; transform-box: view-box; animation: tail 2.8s ease-in-out infinite; }
@keyframes tail { 0%, 100% { transform: rotate(-6deg); } 50% { transform: rotate(7deg); } }
.cat-eyes { transform-box: fill-box; transform-origin: 50% 50%; animation: blink 4.2s linear infinite; }
@keyframes blink { 0%, 94%, 100% { transform: scaleY(1); } 97% { transform: scaleY(.08); } }
'''
JS = '''
const T = %s;
const q = c => document.querySelector('.' + c), cat = document.getElementById('cat'), head = q('cat-head');
function setMouth(code) {
  const e = T[code]; head.dataset.vis = code;
  q('mm').setAttribute('d', e.m.d); q('mm').setAttribute('fill', e.m.fill); q('mm').setAttribute('stroke-width', e.m.sw);
  q('mt').setAttribute('d', e.t); q('mf').setAttribute('d', e.f);
  q('ml').setAttribute('d', e.l ? e.l.d : ''); if (e.l) q('ml').setAttribute('stroke-width', e.l.sw);
  document.querySelectorAll('.codes button').forEach(b => b.classList.toggle('on', b.dataset.c === code));
}
let timer = null; const SEQ = 'XBCDCEAXBGCDHCFXCBDAC';
function say(on) {
  document.body.classList.toggle('talking', on); document.getElementById('talk').classList.toggle('on', on); clearTimeout(timer);
  if (!on) { setMouth('X'); return; }
  let i = 0; (function step() { setMouth(SEQ[i++ %% SEQ.length]); timer = setTimeout(step, 110 + (i * 37) %% 90); })();
}
const bar = document.querySelector('.codes');
for (const c of Object.keys(T)) { const b = document.createElement('button'); b.textContent = c; b.dataset.c = c; b.onclick = () => { say(false); setMouth(c); }; bar.append(b); }
document.getElementById('talk').onclick = e => say(!document.body.classList.contains('talking'));
setMouth('X'); say(true);
'''
html = (f'<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Серая кошка: рот и усы</title>'
        f'<style>{CSS}</style></head><body><div id="wrap">{svg}</div><div class="bar"><button id="talk" class="on">Говорить</button></div>'
        f'<div class="bar codes"></div><div class="hint">X закрытый · A–H — формы рта по буквам озвучки (D, E — широко, язык виден в C D E H). Усы качаются, пока кошка говорит.</div>'
        f'<script>{JS % json.dumps(sp["mouthTable"], ensure_ascii=False)}</script></body></html>')
open(f'{out}/gray_cat_demo.html', 'w', encoding='utf8').write(html)
print('готово', f'{out}/gray_cat_demo.html', len(html) // 1024, 'КБ')
