// Один поток микрофона на весь сеанс страницы (iPhone: приложение на «Домой» спрашивает доступ при КАЖДОМ новом getUserMedia после остановки потока). Здесь чистые помощники gameMic.js:
//  • setTracksEnabled — пауза и конец игры не останавливают дорожку, а выключают (enabled = false): поток жив, следующая игра / «Продолжить» включает его без диалога;
//  • trackState / waitUnmute — после фона дорожка бывает жива, заглушена (muted: iOS прервал захват) или оборвана: заглушённой даём MIC_REVIVE_MS ожить после enabled = true;
//  • createIdleCloser — простой без игры дольше MIC_IDLE_CLOSE_MS закрывает поток по-настоящему (индикатор микрофона не висит вечно; следующий старт спросит снова — компромисс);
//  • onPageUnload — pagehide с выгрузкой страницы (не в bfcache) закрывает поток.
export const MIC_IDLE_CLOSE_MS = 10 * 60 * 1000 // столько поток живёт выключенным без игры, потом закрывается
export const MIC_REVIVE_MS = 500                // столько ждём, пока заглушённая дорожка оживёт после enabled = true

const tracksOf = s => { try { return s?.getAudioTracks ? s.getAudioTracks() : (s?.getTracks?.() ?? []) } catch { return [] } }

/** Состояние потока: 'live' (есть живая не заглушённая дорожка) | 'muted' (живая, но заглушена системой) | 'ended' (все оборваны) | 'none' (нет потока или дорожек) */
export function trackState(s) {
  const ts = tracksOf(s)
  if (!ts.length) return 'none'
  if (ts.some(t => t.readyState === 'live' && !t.muted)) return 'live'
  if (ts.some(t => t.readyState === 'live')) return 'muted'
  return 'ended'
}

/** Включить / выключить все дорожки потока (enabled), не останавливая их */
export function setTracksEnabled(s, on) {
  for (const t of tracksOf(s)) { try { t.enabled = !!on } catch { /* дорожка уже выгружена */ } }
}

/** Остановить дорожки по-настоящему (индикатор гаснет, следующий getUserMedia — диалог) */
export function stopTracks(s) {
  for (const t of tracksOf(s)) { try { t.stop() } catch { /* уже остановлена */ } }
}

/** Ждать, пока заглушённая дорожка оживёт (unmute или опрос), не дольше ms. → Promise<boolean> — ожила ли */
export function waitUnmute(s, ms = MIC_REVIVE_MS, { setTimer = setTimeout, clearTimer = clearTimeout, step = 50 } = {}) {
  return new Promise(resolve => {
    if (trackState(s) === 'live') { resolve(true); return }
    let left = Math.max(0, ms)
    let id = 0
    const ts = tracksOf(s)
    const finish = ok => { clearTimer(id); ts.forEach(t => { try { t.removeEventListener?.('unmute', onUnmute) } catch { /* без событий */ } }); resolve(ok) }
    const onUnmute = () => { if (trackState(s) === 'live') finish(true) }
    ts.forEach(t => { try { t.addEventListener?.('unmute', onUnmute) } catch { /* без событий — опрос */ } })
    const tick = () => {
      const st = trackState(s)
      if (st === 'live') { finish(true); return }
      if (st !== 'muted' || left <= 0) { finish(false); return }
      left -= step
      id = setTimer(tick, step)
    }
    tick()
  })
}

/** Таймер простоя: arm(fn) — через ms вызвать fn (повторный arm перезапускает), disarm() — снять */
export function createIdleCloser({ ms = MIC_IDLE_CLOSE_MS, setTimer = (f, d) => setTimeout(f, d), clearTimer = id => clearTimeout(id) } = {}) { // таймеры берутся при вызове (подмена в тестах)
  let id = 0
  return {
    arm(fn) { clearTimer(id); id = setTimer(() => { id = 0; fn() }, ms) },
    disarm() { clearTimer(id); id = 0 },
    armed: () => !!id,
  }
}

/** pagehide с выгрузкой (event.persisted = false) → fn. Страница ушла в bfcache (persisted) — поток не трогаем. → отписка */
export function onPageUnload(fn, win = typeof window !== 'undefined' ? window : null) {
  if (!win?.addEventListener) return () => {}
  const h = e => { if (!e?.persisted) fn() }
  win.addEventListener('pagehide', h)
  return () => win.removeEventListener('pagehide', h)
}
