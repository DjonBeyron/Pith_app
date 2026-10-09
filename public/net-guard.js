/* Сторож «белого экрана без сети» и «сервер недоступен». ES5, без зависимостей. Подключён СИНХРОННО в <head> index.html
   (без type=module) — отработает, даже если бандл приложения не загрузился.
   (1) Оверлей #offlineGuard, если: сети нет (navigator.onLine === false дольше 700мс подряд — iOS на холодном старте
   может на миг отдать false) — тик 100мс; ИЛИ сеть «есть, но молчит»: через 1.5с без готового приложения стучимся
   крошечным запросом (/favicon.svg, без кэша), и если за 1.5с ответа нет — «Что-то со связью» (≈3с, а не 8с); ИЛИ не загрузился
   скрипт/стиль приложения (ошибка ресурса своего домена) и прошло 2.5с; ИЛИ приложение не нарисовалось в #root за 8с.
   Медленная, но живая сеть (запрос ответил) экран не вызывает. Прячет оверлей, как только в #root что-то появилось; на
   событие online — перезагрузка (только если оверлей уже показан или ресурс упал; иначе идёт обычная загрузка); пока
   оверлей висит из-за молчащей сети, раз в 3с повторяет запрос: ответили — прячет оверлей (перезагрузка, если ресурс уже
   упал с ошибкой). Единая точка «приложение готово» — window.__netGuardDone() (зовётся из скрипта сплэша в index.html).
   (2) Экран #serverGuard «Нет связи с сервером» (страны, где Supabase доступен только через VPN): на холодном старте,
   параллельно с загрузкой приложения, GET на <meta name="pithy-supabase-url">/auth/v1/health (no-cors, без ключа и
   cookie). ЛЮБОЙ HTTP-ответ = сервер достижим и проверка навсегда заканчивается; только сетевая ошибка/таймаут 4с дважды
   подряд (пауза 1.5с, всего ≤ ~9.5с) → экран; дальше проверка раз в 3.5с и по «Повторить», ответили — экран уходит сам,
   а если приложение уже смонтировано (каркас без данных) — одна перезагрузка. После первого ответа экран в этой
   сессии больше не появляется (пропала сеть потом — поведение прежнее, без блокирующего экрана).
   Стили оверлеев (.ng*) лежат инлайном в index.html.
   ЗЕРКАЛО логики: src/app/networkGuard.js (decideNetworkState, decideServerReach, serverHealthUrl и константы) — менять парно.
   Разметка CABLE — копия src/app/networkCableSvg.js (сверяет networkGuard.test.js) */
(function () {
  var BOOT_TIMEOUT = 8000, SLOW_DELAY = 2500, PROBE_AT = 1500, PROBE_WAIT = 1500, REPROBE = 3000, OFFLINE_CONFIRM = 700
  var t0 = Date.now(), failedAt = null, kind = null, el = null, finished = false
  var probed = false, probeFailed = false, offlineSince = null
  /* зеркало NETWORK_TEXTS (src/app/networkGuard.js) */
  var TEXTS = {
    offline: { title: 'Связь пропала', text: 'Проверь интернет или режим полёта — как только связь вернётся, мы продолжим сами' },
    slow: { title: 'Что-то со связью', text: 'Подожди немного или проверь интернет и режим полёта — мы продолжим сами' },
    server: {
      title: 'Нет связи с сервером',
      text: 'Наш сервер не отвечает, хотя интернет, похоже, есть. В некоторых странах приложение работает только через VPN — включи его, и мы продолжим сами'
    },
    retry: 'Повторить',
    checking: 'Проверяем…'
  }
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
  function decide(online, isMounted, failedMs, elapsed, offlineMs) {
    if (isMounted) return 'none'
    if (online === false && (offlineMs === undefined || offlineMs >= OFFLINE_CONFIRM)) return 'offline'
    if (failedMs !== null && failedMs >= SLOW_DELAY) return 'slow'
    if (elapsed >= BOOT_TIMEOUT) return 'slow'
    return 'none'
  }
  window.__netGuardDecide = decide
  window.__ngCableSvg = CABLE
  window.__ngTexts = TEXTS

  function hide() {
    kind = null
    if (el && el.parentNode) el.parentNode.removeChild(el)
    el = null
  }

  /* Полноэкранный экран с кабелем (общая заготовка оверлея сторожа и экрана «сервер недоступен») */
  function makeScreen(id) {
    var node = document.createElement('div')
    node.id = id
    node.className = 'ngScreen'
    node.setAttribute('role', 'alert')
    node.innerHTML = CABLE + '<div class="ngBody"><h1 class="ngTitle"></h1><p class="ngText"></p>' +
      '<button type="button" class="ngBtn">' + TEXTS.retry + '</button></div>'
    document.body.appendChild(node)
    return node
  }

  function show(next) {
    if (!document.body) return /* ещё не разобран — повторим на следующем тике */
    if (!el) {
      el = makeScreen('offlineGuard')
      el.querySelector('.ngBtn').onclick = function () { location.reload() }
    }
    if (kind !== next) {
      kind = next
      el.querySelector('.ngTitle').textContent = TEXTS[next].title
      el.querySelector('.ngText').textContent = TEXTS[next].text
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
    if (online === false) { if (offlineSince === null) offlineSince = Date.now() } else offlineSince = null
    var state = decide(online, false, failedAt === null ? null : Date.now() - failedAt, elapsed,
      offlineSince === null ? 0 : Date.now() - offlineSince)
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

  /* online + пустой #root + оверлей так и не показывали и ресурс не падал = обычная загрузка (iOS на холодном старте
     присылает online/offline, пока поднимает радио): перезагрузка здесь убила бы идущую загрузку — видимое «моргание» */
  window.addEventListener('online', function () {
    if (!finished && !mounted() && (kind !== null || failedAt !== null)) location.reload()
  })
  window.addEventListener('offline', check)
  document.addEventListener('DOMContentLoaded', check)

  /* ───── «Сервер недоступен» (см. шапку, п. 2). Зеркало: decideServerReach / serverHealthUrl в networkGuard.js ───── */
  var SRV_TIMEOUT = 4000, SRV_PAUSE = 1500, SRV_ATTEMPTS = 2, SRV_RECHECK = 3500, SRV_RECHECK_TIMEOUT = 6000
  var srvUrl = null, srvEl = null, srvDone = false, srvResults = [], srvWaitOnline = false

  function srvDecide(results, online) {
    if (results.indexOf('ok') !== -1) return 'reachable'
    if (online === false) return 'offline'
    if (results.length >= SRV_ATTEMPTS) return 'unreachable'
    return 'pending'
  }
  function srvHealthUrl(base) {
    var b = String(base == null ? '' : base).replace(/^\s+|\s+$/g, '').replace(/\/+$/, '')
    return /^https?:\/\/[^\s%]+$/.test(b) ? b + '/auth/v1/health' : null
  }
  window.__srvDecide = srvDecide
  window.__srvHealthUrl = srvHealthUrl

  /* Один GET: no-cors (ответ непрозрачный, CORS не мешает), без cookie/реферера/ключа. done(true) — пришёл ЛЮБОЙ
     HTTP-ответ, done(false) — сетевая ошибка или таймаут */
  function srvPing(timeout, done) {
    var ac = typeof AbortController === 'function' ? new AbortController() : null
    var settled = false, timer = null
    function fin(ok) { if (settled) return; settled = true; clearTimeout(timer); done(ok) }
    timer = setTimeout(function () { if (ac) ac.abort(); fin(false) }, timeout)
    try {
      fetch(srvUrl, { mode: 'no-cors', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: ac ? ac.signal : undefined })
        .then(function () { fin(true) }, function () { fin(false) })
    } catch (e) { fin(false) } // eslint-disable-line no-unused-vars -- ES5-скрипт: catch без переменной нельзя
  }

  /* Сервер ответил: проверка закончена до конца сессии. Экран убираем; приложение уже стартовало без данных
     (каркас) — одна перезагрузка, а если оно ещё грузится, всё продолжится само */
  function srvReached() {
    if (srvDone) return
    srvDone = true
    var wasShown = srvEl !== null
    if (srvEl && srvEl.parentNode) srvEl.parentNode.removeChild(srvEl)
    srvEl = null
    if (wasShown && mounted()) location.reload()
  }

  function srvRecheck() {
    if (srvDone) return
    if (document.hidden) { setTimeout(srvRecheck, SRV_RECHECK); return } /* из фона не стучимся */
    srvPing(SRV_RECHECK_TIMEOUT, function (ok) { if (ok) srvReached(); else setTimeout(srvRecheck, SRV_RECHECK) })
  }

  function srvShow() {
    if (srvDone || srvEl) return
    if (!document.body) { setTimeout(srvShow, 100); return }
    srvEl = makeScreen('serverGuard')
    var btn = srvEl.querySelector('.ngBtn')
    srvEl.querySelector('.ngTitle').textContent = TEXTS.server.title
    srvEl.querySelector('.ngText').textContent = TEXTS.server.text
    btn.onclick = function () {
      if (btn.disabled) return
      btn.disabled = true
      btn.textContent = TEXTS.checking
      srvPing(SRV_RECHECK_TIMEOUT, function (ok) {
        if (ok) { srvReached(); return }
        btn.disabled = false
        btn.textContent = TEXTS.retry
      })
    }
    setTimeout(srvRecheck, SRV_RECHECK)
  }

  function srvAttempt() {
    if (srvDone) return
    srvPing(SRV_TIMEOUT, function (ok) {
      if (srvDone) return
      if (ok) { srvReached(); return }
      srvResults.push('fail')
      var d = srvDecide(srvResults, navigator.onLine)
      if (d === 'unreachable') srvShow()
      else if (d === 'pending') setTimeout(srvAttempt, SRV_PAUSE)
      else srvWaitOnline = true /* сети нет совсем — этим занят экран «Связь пропала»; ждём события online */
    })
  }

  var meta = typeof document.querySelector === 'function' && document.querySelector('meta[name="pithy-supabase-url"]')
  srvUrl = srvHealthUrl(meta && meta.getAttribute('content'))
  if (srvUrl && typeof fetch === 'function') {
    window.addEventListener('online', function () {
      if (srvWaitOnline && !srvDone) { srvWaitOnline = false; srvResults = []; srvAttempt() }
    })
    srvAttempt()
  }

  /* Тик 100мс: без сети оверлей появляется на первом же тике после разбора <body> */
  var timer = setInterval(check, 100)
})();
