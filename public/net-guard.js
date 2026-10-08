/* Сторож «белого экрана без сети». ES5, без зависимостей. Подключён СИНХРОННО в <head> index.html
   (без type=module) — отработает, даже если бандл приложения не загрузился.
   Показывает оверлей #offlineGuard, если: сети нет (navigator.onLine === false) — СРАЗУ (тик 100мс); ИЛИ сеть
   «есть, но молчит»: через 1.5с без готового приложения стучимся крошечным запросом (/favicon.svg, без кэша), и если
   за 1.5с ответа нет — «Слабый интернет» (≈3с, а не 8с); ИЛИ не загрузился скрипт/стиль приложения (ошибка ресурса
   своего домена) и прошло 2.5с; ИЛИ приложение не нарисовалось в #root за 8с. Медленная, но живая сеть (запрос
   ответил) экран не вызывает. Прячет оверлей, как только в #root что-то появилось; на событие online — перезагрузка;
   пока оверлей висит из-за молчащей сети, раз в 3с повторяет запрос: ответили — прячет оверлей (перезагрузка, если
   ресурс уже упал с ошибкой). Стили оверлея (.ng*) лежат инлайном в index.html. Единая точка «приложение готово» —
   window.__netGuardDone() (зовётся из скрипта сплэша в index.html при его уходе).
   ЗЕРКАЛО логики: src/app/networkGuard.js (decideNetworkState и константы) — менять парно.
   Разметка CABLE — копия src/app/networkCableSvg.js (сверяет networkGuard.test.js) */
(function () {
  var BOOT_TIMEOUT = 8000, SLOW_DELAY = 2500, PROBE_AT = 1500, PROBE_WAIT = 1500, REPROBE = 3000
  var t0 = Date.now(), failedAt = null, kind = null, el = null, finished = false
  var probed = false, probeFailed = false
  var CABLE = [
    '<svg class="ngCable" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid meet" aria-hidden="true">',
    '<g transform="translate(195 422) rotate(-63.4)">',
    '<path class="ngWs ngL" d="M-760 0C-727.2 26.7 -702.8 26.7 -670 0S-612.8 -26.7 -580 0S-522.8 26.7 -490 0S-432.8 -26.7 -400 0S-342.8 26.7 -310 0S-252.8 -26.7 -220 0C-203.6 13.3 -189.3 20 -175 20"/>',
    '<path class="ngWc ngL" d="M-760 0C-727.2 26.7 -702.8 26.7 -670 0S-612.8 -26.7 -580 0S-522.8 26.7 -490 0S-432.8 -26.7 -400 0S-342.8 26.7 -310 0S-252.8 -26.7 -220 0C-203.6 13.3 -189.3 20 -175 20"/>',
    '<g transform="translate(-175 20) scale(2.2)">',
    '<path class="ngStrand" stroke="#4fb3ee" d="M0 0Q7.8 -6 14 -7.7"/><path class="ngStrand" stroke="#b6fe3b" d="M0 0Q5.4 4 10.3 3.8"/><path class="ngStrand" stroke="#f1bd3c" d="M0 0Q7.6 8.9 9.9 13.8"/>',
    '<g class="ngBolt" style="--p:3.7s;--d:0.4s"><path class="ngHalo" d="M 0 0 L 2.6 -0.7 L 5.7 -1.4 L 8.6 -4 L 11.5 -5.9 L 13.8 -7.4"/><path class="ngCore" d="M 0 0 L 2.6 -0.7 L 5.7 -1.4 L 8.6 -4 L 11.5 -5.9 L 13.8 -7.4"/><path class="ngStar" d="M 0 0 L 2.5 1.1 M 0 0 L -0.3 2.3 M 0 0 L -3 -0.1 M 0 0 L 0.5 -2.1"/></g>',
    '<g class="ngBolt ngB" style="--p:5.9s;--d:2.2s"><path class="ngHalo" d="M 0 0 L 3 0.3 L 6.5 -0.8 L 10.9 -0.8 L 15.4 -0.4 L 18.4 -0.9"/><path class="ngCore" d="M 0 0 L 3 0.3 L 6.5 -0.8 L 10.9 -0.8 L 15.4 -0.4 L 18.4 -0.9"/></g>',
    '<line class="ngFly" x2="2" y2="0.1" style="--p:2.9s;--d:0.2s;--mx:5.4px;--my:2.7px;--tx:11.1px;--ty:0.5px"/>',
    '</g>',
    '<g transform="rotate(180)">',
    '<path class="ngWs ngR" d="M-760 0C-727.2 26.7 -702.8 26.7 -670 0S-612.8 -26.7 -580 0S-522.8 26.7 -490 0S-432.8 -26.7 -400 0S-342.8 26.7 -310 0S-252.8 -26.7 -220 0C-203.6 13.3 -189.3 20 -175 20"/>',
    '<path class="ngWc ngR" d="M-760 0C-727.2 26.7 -702.8 26.7 -670 0S-612.8 -26.7 -580 0S-522.8 26.7 -490 0S-432.8 -26.7 -400 0S-342.8 26.7 -310 0S-252.8 -26.7 -220 0C-203.6 13.3 -189.3 20 -175 20"/>',
    '<g transform="translate(-175 20) scale(2.2)">',
    '<path class="ngStrand" stroke="#b6fe3b" d="M0 0Q5.4 -5.6 7.5 -9.4"/><path class="ngStrand" stroke="#f1bd3c" d="M0 0Q9 4.4 17.9 1.8"/><path class="ngStrand" stroke="#4fb3ee" d="M0 0Q6.5 7.6 10.2 9.5"/>',
    '<g class="ngBolt ngB" style="--p:4.6s;--d:1.3s"><path class="ngHalo" d="M 0 0 L 3.6 -2.1 L 7.9 -3.4 L 11.6 -2.8 L 15.4 -4.2"/><path class="ngCore" d="M 0 0 L 3.6 -2.1 L 7.9 -3.4 L 11.6 -2.8 L 15.4 -4.2"/><path class="ngStar" d="M 0 0 L 0.6 2.6 M 0 0 L -2.5 1.2 M 0 0 L -0.1 -2.4 M 0 0 L 2.8 -0.8"/></g>',
    '<g class="ngBolt" style="--p:3.1s;--d:3.6s"><path class="ngHalo" d="M 0 0 L 3.5 2.3 L 6.6 2.9 L 9.7 4.2 L 12.8 6.3"/><path class="ngCore" d="M 0 0 L 3.5 2.3 L 6.6 2.9 L 9.7 4.2 L 12.8 6.3"/></g>',
    '<line class="ngFly" x2="1.9" y2="-0.6" style="--p:4.3s;--d:1.7s;--mx:5px;--my:1.1px;--tx:8.6px;--ty:-2.5px"/>',
    '</g>',
    '</g>',
    '</g>',
    '</svg>',
  ].join('')

  function root() { return document.getElementById('root') }
  function mounted() { var r = root(); return !!(r && r.firstChild) }

  /* зеркало decideNetworkState (src/app/networkGuard.js) */
  function decide(online, isMounted, failedMs, elapsed) {
    if (isMounted) return 'none'
    if (online === false) return 'offline'
    if (failedMs !== null && failedMs >= SLOW_DELAY) return 'slow'
    if (elapsed >= BOOT_TIMEOUT) return 'slow'
    return 'none'
  }
  window.__netGuardDecide = decide
  window.__ngCableSvg = CABLE

  function hide() {
    kind = null
    if (el && el.parentNode) el.parentNode.removeChild(el)
    el = null
  }

  function show(next) {
    if (!document.body) return /* ещё не разобран — повторим на следующем тике */
    if (!el) {
      el = document.createElement('div')
      el.id = 'offlineGuard'
      el.className = 'ngScreen'
      el.setAttribute('role', 'alert')
      el.innerHTML = CABLE + '<div class="ngBody"><h1 class="ngTitle"></h1>' +
        '<p class="ngText">Проверь соединение — мы подключимся сами</p>' +
        '<button type="button" class="ngBtn">Повторить</button></div>'
      el.querySelector('.ngBtn').onclick = function () { location.reload() }
      document.body.appendChild(el)
    }
    if (kind !== next) {
      kind = next
      el.querySelector('.ngTitle').textContent = next === 'offline' ? 'Нет интернета' : 'Слабый интернет'
    }
  }

  /* Лёгкий запрос «отвечает ли сеть»: маленький файл мимо кэша; ответ-картинка = жива, ошибка/молчание = нет */
  function ping(done) {
    if (typeof fetch !== 'function') return done(true)
    var ac = typeof AbortController === 'function' ? new AbortController() : null
    var timer = setTimeout(function () { if (ac) ac.abort(); done(false); done = function () {} }, PROBE_WAIT)
    fetch('/favicon.svg?_=' + Date.now(), { cache: 'no-store', signal: ac ? ac.signal : undefined })
      .then(function (r) {
        clearTimeout(timer)
        done(r.ok && /svg/.test(r.headers.get('content-type') || ''))
      }, function () { clearTimeout(timer); done(false) })
  }

  /* Оверлей висит из-за молчащей сети: раз в 3с стучимся снова */
  function reprobe() {
    ping(function (ok) {
      if (finished) return
      if (!ok) { setTimeout(reprobe, REPROBE); return }
      probeFailed = false
      if (failedAt !== null) location.reload()
      else check()
    })
  }

  function check() {
    if (finished) return
    if (mounted()) { finished = true; hide(); clearInterval(timer); return }
    var online = navigator.onLine, elapsed = Date.now() - t0
    var state = decide(online, false, failedAt === null ? null : Date.now() - failedAt, elapsed)
    if (state === 'none' && probeFailed) state = 'slow'
    if (state === 'none' && !probed && online !== false && elapsed >= PROBE_AT) {
      probed = true
      ping(function (ok) { if (!ok && !finished) { probeFailed = true; check(); setTimeout(reprobe, REPROBE) } })
    }
    if (state === 'none') { if (kind) hide() } else show(state)
  }

  /* Приложение готово: сплэш ушёл. Если #root пуст (сплэш убрала страховка HARD, а бандла нет) —
     не считаем готовым, сторож продолжает следить */
  window.__netGuardDone = check

  /* Ошибки загрузки СВОИХ скриптов/стилей (не шрифтов Google и не картинок) */
  window.addEventListener('error', function (e) {
    var t = e.target
    if (!t || t === window || !t.tagName) return
    var tag = t.tagName, url = t.src || t.href || ''
    if (tag !== 'SCRIPT' && tag !== 'LINK') return
    if (url.indexOf(location.origin) !== 0) return
    if (failedAt === null) failedAt = Date.now()
  }, true)

  window.addEventListener('online', function () {
    if (!finished && !mounted()) location.reload()
  })
  window.addEventListener('offline', check)
  document.addEventListener('DOMContentLoaded', check)

  /* Тик 100мс: без сети оверлей появляется на первом же тике после разбора <body> */
  var timer = setInterval(check, 100)
})();
