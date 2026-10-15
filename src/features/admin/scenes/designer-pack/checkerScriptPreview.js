// JS автономного проверщика, часть 2: предпросмотр. Кот — внутри контейнера .scn.scn--live
// с теми же классами, что у приложения (cat-tail/cat-body/cat-head/cat-eyes; рот по data-mouth
// на <svg>; is-talking — речь), поэтому CSS scene-v2-cat.css анимирует файл дизайнера как
// встроенного кота. Предмет — мини-сцена 360×640 с якорем выбранной ячейки. Фон — как есть.
// Текст скрипта (строка), без обратных кавычек; C — константы ядра, S — состояние (часть 1).

export const CHECKER_JS_PREVIEW = String.raw`
var NS = 'http://www.w3.org/2000/svg'
var talkTimer = null, talkI = 0, wordLeft = 0

// Файл дизайнера → безопасный <svg>: запрещённые теги и обработчики вырезаются (проверка их и так не пропустит)
function parseSvg(text) {
  var doc = new DOMParser().parseFromString(text, 'image/svg+xml')
  var svg = doc.documentElement
  if (!svg || svg.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) return null
  var bad = doc.querySelectorAll(C.FORBIDDEN_TAGS.join(','))
  for (var i = bad.length - 1; i >= 0; i--) bad[i].parentNode && bad[i].parentNode.removeChild(bad[i])
  var all = svg.querySelectorAll('*')
  for (var j = 0; j < all.length; j++) {
    var at = all[j].attributes
    for (var k = at.length - 1; k >= 0; k--) if (/^on/i.test(at[k].name) || /href$/i.test(at[k].name) || /url\(/i.test(at[k].value)) all[j].removeAttribute(at[k].name)
  }
  svg.removeAttribute('width'); svg.removeAttribute('height')
  return document.importNode(svg, true)
}

// Группы кота получают классы анимации как у встроенного кота: вложенная <g class="cat-…">
function animWrap(svg) {
  var map = { tail: 'cat-tail', body: 'cat-body', head: 'cat-head', eyes: 'cat-eyes' }
  Object.keys(map).forEach(function (part) {
    var g = svg.querySelector('[data-part="' + part + '"]'); if (!g) return
    var w = document.createElementNS(NS, 'g'); w.setAttribute('class', map[part])
    while (g.firstChild) w.appendChild(g.firstChild)
    g.appendChild(w)
  })
}

function applyEmotion(svg) {
  var groups = svg.querySelectorAll('[data-emotion]'), has = {}
  for (var i = 0; i < groups.length; i++) has[groups[i].getAttribute('data-emotion')] = true
  for (var j = 0; j < groups.length; j++) {
    var e = groups[j].getAttribute('data-emotion')
    var show = e === S.emo || (e === 'neutral' && !has[S.emo])
    groups[j].style.display = show ? 'inline' : 'none'
  }
  return groups.length
}

function applyAnimState(stage) {
  stage.classList.toggle('scn--paused', S.paused)
  if (stage.getAnimations) stage.getAnimations({ subtree: true }).forEach(function (a) { a.playbackRate = S.speed })
}

function stopTalk() { if (talkTimer) clearInterval(talkTimer); talkTimer = null }
function startTalk() {
  stopTalk(); talkI = 0; wordLeft = 2 + Math.floor(Math.random() * 4)
  var step = function () {
    var svg = $('#stage svg'); if (!svg) return
    if (--wordLeft <= 0) { talkI = 0; wordLeft = 2 + Math.floor(Math.random() * 4) } else talkI = (talkI + 1) % C.MOUTH_CYCLE.length
    svg.setAttribute('data-mouth', C.MOUTH_CYCLE[talkI])
  }
  step(); talkTimer = setInterval(step, C.MOUTH_STEP_MS / S.speed)
}

function propScene(svg) {
  var slot = C.PREVIEW_SLOTS.filter(function (s) { return s.id === S.slot })[0] || C.PREVIEW_SLOTS[0]
  var vb = (svg.getAttribute('viewBox') || '0 0 60 60').trim().split(/[\s,]+/).map(Number)
  var sc = document.createElementNS(NS, 'svg'); sc.setAttribute('viewBox', '0 0 360 640'); sc.setAttribute('class', 'prop-scene')
  var dark = S.dark
  var add = function (tag, a) { var el = document.createElementNS(NS, tag); Object.keys(a).forEach(function (k) { el.setAttribute(k, a[k]) }); sc.appendChild(el); return el }
  add('rect', { x: 0, y: 0, width: 360, height: C.floorY, fill: dark ? '#3a4458' : '#e8eef5' })
  add('rect', { x: 0, y: C.floorY, width: 360, height: 640 - C.floorY, fill: dark ? '#5a4634' : '#c9a27a' })
  add('line', { x1: 0, y1: C.floorY, x2: 360, y2: C.floorY, stroke: dark ? '#2b3242' : '#b88c63', 'stroke-width': 2 })
  if (slot.layer === 'tabletop' || slot.layer === 'table') {
    var t = C.tableRect
    add('rect', { x: t.x, y: t.y, width: t.w, height: 14, rx: 4, fill: '#a67c57' }); add('rect', { x: t.x, y: t.y + 14, width: t.w, height: 6, fill: '#8d6a4b' })
    add('path', { d: 'M' + (t.x + 11) + ' ' + (t.y + 20) + ' h10 v40 h-10 z M' + (t.x + t.w - 21) + ' ' + (t.y + 20) + ' h10 v40 h-10 z', fill: '#8d6a4b' })
  }
  var g = add('g', { transform: 'translate(' + slot.x + ' ' + slot.y + ')' + (slot.scale !== 1 ? ' scale(' + slot.scale + ')' : '') })
  svg.setAttribute('x', vb[0]); svg.setAttribute('y', vb[1]); svg.setAttribute('width', vb[2]); svg.setAttribute('height', vb[3]); svg.setAttribute('overflow', 'visible')
  g.appendChild(svg)
  var dot = document.createElementNS(NS, 'circle'); dot.setAttribute('r', 3.5); dot.setAttribute('fill', '#e0564e'); dot.setAttribute('stroke', '#fff'); dot.setAttribute('stroke-width', 1.2); g.appendChild(dot)
  return sc
}

function renderPreview() {
  var sec = $('#sec-prev'), stage = $('#stage'), note = $('#prev-note')
  var svg = parseSvg(S.text)
  if (!svg) { sec.hidden = true; return }
  sec.hidden = false
  $('#ctl-cat').hidden = S.kind !== 'cat'; $('#ctl-prop').hidden = S.kind !== 'prop'
  stage.innerHTML = ''
  stage.classList.toggle('dark', S.dark); stage.parentNode.classList.toggle('dark', S.dark)
  if (S.kind === 'cat') {
    animWrap(svg); var emoGroups = applyEmotion(svg)
    svg.setAttribute('class', 'scn-cat' + (S.talking && !S.paused ? ' is-talking' : '')); svg.setAttribute('data-mouth', S.mouth)
    stage.style.width = Math.round(200 * S.zoom) + 'px'; stage.appendChild(svg)
    var missing = ['tail', 'body', 'head', 'eyes'].filter(function (p) { return !svg.querySelector('[data-part="' + p + '"] .cat-' + p) })
    note.textContent = (missing.length ? 'Не анимируются (нет групп data-part): ' + missing.join(', ') + '. ' : 'Анимируются хвост, тело, голова, глаза — как в приложении. ') +
      (emoGroups ? 'Эмоции в файле: группы data-emotion переключаются. ' : S.emo !== 'neutral' ? 'В файле нет групп data-emotion — здесь эмоция ничего не меняет (см. «?»). ' : '')
    if (S.talking && !S.paused) startTalk(); else stopTalk()
  } else if (S.kind === 'prop') {
    stopTalk(); stage.style.width = Math.round(270 * S.zoom) + 'px'; stage.appendChild(propScene(svg))
    note.textContent = 'Предмет поставлен точкой (0,0) в якорь ячейки «' + ($('#slot button.on') || {}).textContent + '». Если он «висит в воздухе» или «утонул» — сдвиньте рисунок относительно (0,0), а не ячейку.'
  } else {
    stopTalk(); stage.style.width = Math.round(270 * S.zoom) + 'px'; svg.setAttribute('class', 'prop-scene'); stage.appendChild(svg)
    note.textContent = 'Фон как он ляжет под сцену: стена сверху, пол от y = ' + C.floorY + '. Коты встанут на пол, стол — между ними.'
  }
  applyAnimState(stage)
}

function segInit(sel, key, attr) {
  var bs = document.querySelectorAll(sel + ' button')
  var mark = function () { for (var i = 0; i < bs.length; i++) bs[i].classList.toggle('on', bs[i].getAttribute(attr) === S[key]) }
  for (var i = 0; i < bs.length; i++) bs[i].addEventListener('click', function (e) { S[key] = e.currentTarget.getAttribute(attr); mark(); renderPreview() })
  mark()
}

function initPreviewControls() {
  segInit('#emo', 'emo', 'data-emo'); segInit('#mouth', 'mouth', 'data-mouth'); segInit('#slot', 'slot', 'data-slot')
  $('#talk').addEventListener('change', function (e) { S.talking = e.target.checked; renderPreview() })
  $('#pause').addEventListener('change', function (e) { S.paused = e.target.checked; renderPreview() })
  $('#dark').addEventListener('change', function (e) { S.dark = e.target.checked; renderPreview() })
  $('#speed').addEventListener('input', function (e) { S.speed = Number(e.target.value); $('#speedv').textContent = S.speed + '×'; renderPreview() })
  $('#zoom').addEventListener('input', function (e) { S.zoom = Number(e.target.value); $('#zoomv').textContent = S.zoom + '×'; renderPreview() })
}
`
