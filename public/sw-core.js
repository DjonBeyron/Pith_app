/* Чистая логика service worker'а (push-sw.js): БЕЗ обращений к caches/fetch/self — поэтому тестируется vitest'ом через vm
   (src/shared/lib/swCore.test.js). UMD без модулей: в воркере подключается importScripts('/sw-core.js') и даёт self.PithySwCore.
   Что здесь решается: какой это запрос (route), отдавать ли оболочку из кеша (decideNav), «аварийный выход» ?nosw=1,
   флаг отключения кеша оболочки на время, защита «страница не загрузилась» (bootCheck/confirmBoot), ротация кешей
   (planRotation), валидность файла при предзагрузке (validPrecache), вид статуса для админки (statusView).
   Состояние (state) — обычный JSON, его хранит push-sw.js в Cache API; здесь функции только меняют/читают объект. */
/* global module */
(function (root, factory) {
  var api = factory()
  if (typeof module === 'object' && module && module.exports) module.exports = api
  else root.PithySwCore = api
})(typeof self !== 'undefined' ? self : this, function () {
  var SHELL_PREFIX = 'shell-'
  var STATE_CACHE = 'pithy-sw-state'
  var STATE_KEY = '/__pithy_sw_state'
  var MARK_KEY = '/__shell_ok' // последний файл кеша оболочки: есть метка = кеш полный (атомарность)
  var SHELL_KEY = '/' // ключ index.html в кеше оболочки (запрос с любым ?query находится через ignoreSearch)
  var DISABLE_MS = 24 * 3600 * 1000 // ?nosw=1 / кнопка «Выключить» / защита от залипания
  var BOOT_WAIT_MS = 10000 // страница из кеша должна сообщить boot-ok за это время
  var BOOT_FAILS = 2 // столько запусков подряд без boot-ok — кеш выключаем
  var BLOCK_MS = 30 * 60 * 1000 // после purge-shell тот же BUILD_ID заново не предзагружаем столько времени
  var MAX_SHELL_CACHES = 2 // текущий + предыдущий (открытая страница старой версии не теряет ленивые чанки)
  var OFFLINE_SHELL = false // false: при navigator.onLine === false отдаём офлайн-страницу (как до кеша оболочки)

  // Кеш оболочки включён только в собранном воркере: плагин (tools/viteShellCache.js) подставляет BUILD_ID и список
  var configured = function (buildId, precache) {
    return typeof buildId === 'string' && buildId.length > 0 && !/^__.*__$/.test(buildId) && Array.isArray(precache) && precache.length > 0
  }
  var cacheName = function (buildId) { return SHELL_PREFIX + buildId }
  var isShellName = function (name) { return typeof name === 'string' && name.indexOf(SHELL_PREFIX) === 0 }
  var isNosw = function (search) { return /[?&]nosw=1(&|$)/.test(String(search || '')) }

  // r = { pathname, search, sameOrigin, method, mode, cache }; statics — Set путей предзагруженных НЕ-/assets файлов
  // 'lab' | 'skip' | 'shell-nav' (страница приложения) | 'nav' (прочая навигация) | 'asset' (/assets/*) | 'static' | 'other'
  function route(r, statics) {
    if (!r.sameOrigin || r.method !== 'GET') return r.mode === 'navigate' ? 'nav' : 'skip'
    if (String(r.pathname).indexOf('/lab/') === 0) return 'lab'
    if (r.mode === 'navigate') return r.pathname === '/' || r.pathname === '/index.html' ? 'shell-nav' : 'nav'
    if (r.cache === 'no-store') return 'other' // пинги net-guard и проверки версии (cache: 'no-store') идут ТОЛЬКО в сеть
    if (String(r.pathname).indexOf('/assets/') === 0) return 'asset'
    if (statics && statics.has && statics.has(r.pathname)) return 'static'
    return 'other'
  }

  // ───── состояние ─────
  function normState(o) {
    var s = o && typeof o === 'object' ? o : {}
    return {
      v: 1, disabledUntil: +s.disabledUntil || 0, why: s.why || '', pending: s.pending || null, fails: +s.fails || 0,
      blocked: s.blocked || '', blockedUntil: +s.blockedUntil || 0, nav: s.nav || null,
    }
  }
  var isDisabled = function (st, now) { return st.disabledUntil > 0 && now < st.disabledUntil }
  var isBlocked = function (st, buildId, now) { return st.blocked === buildId && now < st.blockedUntil }
  function disableState(st, now, ms, why) {
    st.disabledUntil = now + (ms || DISABLE_MS); st.why = why || 'manual'; st.pending = null; st.fails = 0
    return st
  }
  function enableState(st) {
    st.disabledUntil = 0; st.why = ''; st.pending = null; st.fails = 0; st.blocked = ''; st.blockedUntil = 0
    return st
  }
  function blockBuild(st, buildId, now) { st.blocked = buildId; st.blockedUntil = now + BLOCK_MS; return st }

  // Защита от залипания. Прошлый запуск отдан из кеша, а boot-ok так и не пришёл (прошло ≥ BOOT_WAIT_MS) — это неудача.
  // Меняет st.fails/st.pending; true — неудач подряд набралось BOOT_FAILS, кеш пора выключать
  function bootCheck(st, now) {
    var p = st.pending
    if (p && now - p.at >= BOOT_WAIT_MS) { st.fails += 1; st.pending = null }
    return st.fails >= BOOT_FAILS
  }
  // Страница смонтировалась и прислала boot-ok: запуск удался, счётчик неудач с нуля. true — состояние изменилось
  function confirmBoot(st, buildId) {
    if (!st.pending && !st.fails) return false
    if (st.pending && buildId && st.pending.build !== buildId) return false
    st.pending = null; st.fails = 0
    return true
  }

  // Решение по навигации на страницу приложения. Меняет st (bootCheck/срок отключения), остальное — в результате:
  // { mode: 'shell'|'legacy', why, disableFor?, purge?, ensure?, reenable? }
  function decideNav(c) {
    var st = c.state
    if (!c.configured) return { mode: 'legacy', why: 'unconfigured' }
    if (isNosw(c.search)) return { mode: 'legacy', why: 'nosw', disableFor: DISABLE_MS, purge: true }
    var reenable = st.disabledUntil > 0 && c.now >= st.disabledUntil // срок отключения вышел
    if (reenable) { st.disabledUntil = 0; st.why = ''; st.fails = 0; st.pending = null }
    if (isDisabled(st, c.now)) return { mode: 'legacy', why: 'disabled' }
    if (c.hasShell && bootCheck(st, c.now)) return { mode: 'legacy', why: 'boot', disableFor: DISABLE_MS, purge: true }
    if (c.online === false && !OFFLINE_SHELL) return { mode: 'legacy', why: 'offline', reenable: reenable }
    if (!c.hasShell) return { mode: 'legacy', why: 'nocache', reenable: reenable, ensure: c.online !== false && !isBlocked(st, c.buildId, c.now) }
    return { mode: 'shell', why: 'ok', reenable: reenable }
  }
  // Кеш оболочки сейчас можно использовать для /assets/* и статики
  var shellActive = function (st, now) { return !isDisabled(st, now) }

  // ───── кеши ─────
  // names — все имена кешей; stamps[name] — время метки полноты (число) или null (кеш неполный); own — кеш этого воркера.
  // Удаляем неполные и всё, что старше max полных кешей (свой, если полный, учитывается первым)
  function planRotation(names, own, stamps, max) {
    var shells = (names || []).filter(isShellName), keep = [], del = []
    var limit = max || MAX_SHELL_CACHES
    if (stamps[own]) keep.push(own)
    shells.filter(function (n) { return n !== own && stamps[n] }).sort(function (a, b) { return stamps[b] - stamps[a] })
      .forEach(function (n) { if (keep.length < limit) keep.push(n) })
    shells.forEach(function (n) { if (keep.indexOf(n) === -1) del.push(n) })
    return del
  }
  var fetchMode = function (url) { return String(url).indexOf('/assets/') === 0 ? 'default' : 'reload' } // хешированные — из HTTP-кеша, остальное — свежим
  // Ответ на предзагрузку годится, только если это настоящий файл: 200, без редиректа, а js/css — не HTML (rewrite на index.html)
  function validPrecache(url, res) {
    if (!res || !res.ok || res.redirected) return false
    return !(/\.(js|css|svg|png|webmanifest)$/.test(String(url)) && /text\/html/i.test(res.ct || ''))
  }

  // Порядок предзагрузки: сначала точка входа и страница (при проблеме падаем быстро), потом остальное
  var precacheOrder = function (urls) {
    var rank = function (u) { return u === '/' ? 0 : /\/assets\/index-.*\.(js|css)$/.test(u) ? 1 : 2 }
    return urls.slice().sort(function (a, b) { return rank(a) - rank(b) })
  }

  // Что отдаём админке (Админ → «Старт» → «Быстрый старт») и журналу старта
  function statusView(c) {
    var st = c.state
    return {
      type: 'shell-status', configured: c.configured, build: c.build, version: c.version,
      enabled: c.configured && !isDisabled(st, c.now), disabledUntil: st.disabledUntil, why: st.why, fails: st.fails,
      pending: !!st.pending, own: !!c.own, caches: c.caches || [], nav: st.nav, blocked: isBlocked(st, c.build, c.now),
    }
  }

  return {
    SHELL_PREFIX: SHELL_PREFIX, STATE_CACHE: STATE_CACHE, STATE_KEY: STATE_KEY, MARK_KEY: MARK_KEY, SHELL_KEY: SHELL_KEY,
    DISABLE_MS: DISABLE_MS, BOOT_WAIT_MS: BOOT_WAIT_MS, BOOT_FAILS: BOOT_FAILS, BLOCK_MS: BLOCK_MS, MAX_SHELL_CACHES: MAX_SHELL_CACHES,
    OFFLINE_SHELL: OFFLINE_SHELL, configured: configured, cacheName: cacheName, isShellName: isShellName, isNosw: isNosw, route: route,
    normState: normState, isDisabled: isDisabled, isBlocked: isBlocked, disableState: disableState, enableState: enableState,
    blockBuild: blockBuild, bootCheck: bootCheck, confirmBoot: confirmBoot, decideNav: decideNav, shellActive: shellActive,
    planRotation: planRotation, fetchMode: fetchMode, validPrecache: validPrecache, precacheOrder: precacheOrder, statusView: statusView,
  }
})
