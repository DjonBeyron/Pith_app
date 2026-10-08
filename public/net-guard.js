/* Сторож «белого экрана без сети». ES5, без зависимостей. Подключён СИНХРОННО в <head> index.html
   (без type=module) — отработает, даже если бандл приложения не загрузился.
   Показывает оверлей #offlineGuard, если: сети нет (navigator.onLine === false), ИЛИ не загрузился
   скрипт/стиль приложения (ошибка ресурса своего домена) и прошло 2.5с, ИЛИ приложение не нарисовалось
   в #root за 8с. Прячет оверлей, как только в #root что-то появилось; на событие online — перезагрузка.
   Стили оверлея (.ng*) лежат инлайном в index.html. Единая точка «приложение готово» —
   window.__netGuardDone() (зовётся из скрипта сплэша в index.html при его уходе).
   ЗЕРКАЛО логики: src/app/networkGuard.js (decideNetworkState и константы) — менять парно. */
(function () {
  var BOOT_TIMEOUT = 8000, SLOW_DELAY = 2500
  var t0 = Date.now(), failedAt = null, kind = null, el = null, finished = false

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
      el.innerHTML = '<div class="ngPulse"></div><h1 class="ngTitle"></h1>' +
        '<p class="ngText">Проверь соединение — мы подключимся сами</p>' +
        '<button type="button" class="ngBtn">Повторить</button>'
      el.lastChild.onclick = function () { location.reload() }
      document.body.appendChild(el)
    }
    if (kind !== next) {
      kind = next
      el.firstChild.nextSibling.textContent = next === 'offline' ? 'Нет интернета' : 'Слабый интернет'
    }
  }

  function check() {
    if (finished) return
    if (mounted()) { finished = true; hide(); clearInterval(timer); return }
    var state = decide(navigator.onLine, false,
      failedAt === null ? null : Date.now() - failedAt, Date.now() - t0)
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

  var timer = setInterval(check, 250)
})();
