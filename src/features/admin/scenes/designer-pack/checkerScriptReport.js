// JS автономного проверщика, часть 1: ввод файла, тип, отчёт (вердикт, бюджет, группы,
// нарушения с «как исправить»). Это ТЕКСТ скрипта (строка): в HTML перед ним вставлен
// исходник spriteCheck.js и fixHints.js (без export), поэтому здесь доступны
// checkSpriteSvg / spriteCheckSummary / fixHintFor и объект C с константами ядра.
// Без шаблонных строк и без обратных кавычек — файл сам лежит в шаблонной строке.

export const CHECKER_JS_REPORT = String.raw`
var $ = function (s) { return document.querySelector(s) }
var S = { kind: 'prop', text: '', mouth: 'closed', emo: 'neutral', talking: false, paused: false, speed: 1, dark: false, zoom: 1, slot: C.PREVIEW_SLOTS[0].id, kindManual: false }
var PART_RE = /data-part\s*=\s*["']([^"']+)["']/g
var VISEME_RE = /data-viseme\s*=\s*["']([^"']+)["']/g
var EMO_RE = /data-emotion\s*=\s*["']([^"']+)["']/g
function found(text, re) { var out = [], m; re.lastIndex = 0; while ((m = re.exec(text))) if (out.indexOf(m[1]) < 0) out.push(m[1]); return out }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;') }

// Тип по содержимому: виземы или холст 200×240 — кот; 360×640 с wall/floor — фон; иначе предмет
function detectKind(text) {
  var m = /viewBox\s*=\s*["']([^"']+)["']/.exec(text)
  var vb = m ? m[1].trim().split(/[\s,]+/).map(Number) : []
  var parts = found(text, PART_RE)
  if (/data-viseme/.test(text) || (vb[2] === C.SPRITE_KINDS.cat.viewBox.w && vb[3] === C.SPRITE_KINDS.cat.viewBox.h)) return 'cat'
  if (vb[2] === C.SPRITE_KINDS.background.viewBox.w && vb[3] === C.SPRITE_KINDS.background.viewBox.h && (parts.indexOf('wall') >= 0 || parts.indexOf('floor') >= 0)) return 'background'
  return 'prop'
}

function setKind(k, manual) {
  S.kind = k; if (manual) S.kindManual = true
  var bs = document.querySelectorAll('#kind button')
  for (var i = 0; i < bs.length; i++) bs[i].setAttribute('aria-checked', bs[i].getAttribute('data-kind') === k ? 'true' : 'false')
}

function chips(el, label, items, required, cls) {
  if (!items.length && !required.length) { el.innerHTML = ''; return }
  var all = items.slice(); for (var i = 0; i < required.length; i++) if (all.indexOf(required[i]) < 0) all.push(required[i])
  el.innerHTML = '<span class="lbl">' + label + '</span>' + all.map(function (p) {
    var has = items.indexOf(p) >= 0, req = required.indexOf(p) >= 0
    return '<span class="chip ' + (has ? (req ? 'ok' : '') : 'miss') + '" title="' + (has ? 'найдена' : 'обязательная, не найдена') + '">' + esc(p) + '</span>'
  }).join('') + (cls ? ' <span class="muted">' + cls + '</span>' : '')
}

function renderReport() {
  var rep = $('#sec-rep'), prev = $('#sec-prev')
  if (!S.text.trim()) { rep.hidden = true; prev.hidden = true; return }
  var rules = C.SPRITE_KINDS[S.kind]
  var sum = spriteCheckSummary(S.text, S.kind)
  rep.hidden = false
  var v = $('#verdict')
  v.className = 'verdict ' + (sum.ok ? 'ok' : 'bad')
  v.textContent = sum.ok ? 'Можно отправлять — файл проходит все проверки' : 'Исправьте ' + sum.problems.length + (sum.problems.length === 1 ? ' пункт' : sum.problems.length < 5 ? ' пункта' : ' пунктов') + ' ниже и проверьте снова'
  var pct = Math.min(100, Math.round(sum.nodes / rules.maxNodes * 100))
  var bar = $('#bar'); bar.style.width = pct + '%'
  bar.className = 'fill' + (sum.nodes > rules.maxNodes ? ' over' : pct > 80 ? ' warn' : '')
  $('#nodes').textContent = 'Узлов: ' + sum.nodes + ' из ' + rules.maxNodes + (S.kind === 'cat' ? ' (встроенные коты — 53–58)' : S.kind === 'prop' ? ' (лучше 4–8)' : '')
  chips($('#parts'), 'Группы data-part:', found(S.text, PART_RE), rules.requiredParts)
  var emos = found(S.text, EMO_RE)
  chips($('#visemes'), S.kind === 'cat' ? 'Формы рта data-viseme:' : '', S.kind === 'cat' ? found(S.text, VISEME_RE) : [], rules.requiredVisemes || [],
    S.kind === 'cat' && emos.length ? '· эмоции в файле: ' + emos.join(', ') : '')
  $('#problems').innerHTML = sum.problems.map(function (p) {
    var fix = fixHintFor(p)
    return '<li><b>' + esc(p) + '</b>' + (fix ? '<span class="fix">' + esc(fix) + '</span>' : '') + '</li>'
  }).join('')
  renderPreview(sum)
}

function setText(text, name) {
  S.text = text || ''
  $('#src').value = S.text
  $('#fname').textContent = name || ''
  if (!S.kindManual && S.text.trim()) setKind(detectKind(S.text), false)
  renderReport()
}

function readFile(f) {
  if (!f) return
  var r = new FileReader()
  r.onload = function () { S.kindManual = false; setText(String(r.result || ''), f.name) }
  r.onerror = function () { $('#fname').textContent = 'Не удалось прочитать файл' }
  r.readAsText(f)
}

document.addEventListener('DOMContentLoaded', function () {
  var kb = document.querySelectorAll('#kind button')
  for (var i = 0; i < kb.length; i++) kb[i].addEventListener('click', function (e) { setKind(e.currentTarget.getAttribute('data-kind'), true); renderReport() })
  $('#file').addEventListener('change', function (e) { readFile(e.target.files && e.target.files[0]); e.target.value = '' })
  $('#src').addEventListener('input', function (e) { S.kindManual = false; $('#fname').textContent = ''; setText(e.target.value, '') })
  $('#clear').addEventListener('click', function () { S.kindManual = false; setText('', '') })
  $('#demo').addEventListener('click', function () { S.kindManual = false; setText(document.getElementById('demo-cat').textContent.trim(), 'шаблон кота (пример)') })
  var ta = $('#src')
  ta.addEventListener('dragover', function (e) { e.preventDefault(); ta.classList.add('over') })
  ta.addEventListener('dragleave', function () { ta.classList.remove('over') })
  ta.addEventListener('drop', function (e) { e.preventDefault(); ta.classList.remove('over'); readFile(e.dataTransfer.files && e.dataTransfer.files[0]) })
  initPreviewControls()
  setKind('prop', false)
})
`
