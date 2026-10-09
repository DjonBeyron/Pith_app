import { fmtT, parseKv, replaySamples, fullEvents } from './startLogEvents.js'

// Автоподсветка подозрительных мест в журнале старта (чистая функция, ничего не читает снаружи).
// Возвращает { suspects: [{ level: 'warn' | 'info', t, code, text }], stats }.
// «После первого кадра» = после события raf-first (первый requestAnimationFrame страницы).
const EARLY = 3000 // события раньше этого момента считаем «на старте»
const BLACK = ['rgb(0,0,0)', 'rgba(0,0,0,1)']
const num = v => (v === undefined || v === '-' ? null : parseFloat(v))

function stateSuspects(ev, add) {
  const states = replaySamples(ev)
  let blank = false, fontsLate = false
  states.forEach(({ t, state, changed, prev }, i) => {
    const first = i === 0
    if (first && changed.bg !== undefined && !BLACK.includes(changed.bg)) add('warn', t, 'color', `фон html в первом кадре ${changed.bg}, а не чёрный`)
    if (!first) {
      for (const k of ['bg', 'bb']) {
        if (changed[k] !== undefined && prev[k] !== undefined) add('warn', t, 'color', `смена цвета фона ${k === 'bg' ? 'html' : 'body'}: ${prev[k]} -> ${changed[k]}`)
      }
      for (const k of ['so', 'fd']) {
        const a = num(prev[k]), b = num(changed[k])
        if (a !== null && b !== null && Math.abs(b - a) > 0.5) add('warn', t, 'opacity-jump', `скачок прозрачности ${k === 'so' ? 'сплэша' : 'проявления лого'}: ${a} -> ${b} за один кадр`)
        if (k === 'so' && changed.so === '-' && a !== null && a >= 0.5) add('warn', t, 'splash-cut', `сплэш убран из DOM при прозрачности ${a} (резкий обрыв)`)
      }
      if (changed.lg !== undefined && prev.lg && prev.lg !== '-' && changed.lg !== '-') add('warn', t, 'logo-move', `лого сдвинулось/изменилось: ${prev.lg} -> ${changed.lg}`)
    }
    if (changed.ng !== undefined && changed.ng !== '0') add('warn', t, 'net-screen', `виден экран связи (${changed.ng}: o=offlineGuard, s=serverGuard)`)
    const splashLeaving = state.so === '-' || (num(state.so) !== null && num(state.so) < 1)
    if (!blank && splashLeaving && state.rt === '0') { blank = true; add('warn', t, 'blank', 'сплэш уходит/ушёл, а #root ещё пуст: под ним пустой кадр') }
    if (!fontsLate && splashLeaving && changed.fn === 'loading') { fontsLate = true; add('warn', t, 'fonts-late', 'шрифты начали грузиться после ухода сплэша: подписи могут перескочить') }
  })
}

function eventSuspects(rec, ev, add, firstFrame) {
  const ctx = rec.ctx || {}
  for (const [t, type, d] of ev) {
    const early = t < EARLY
    switch (type) {
      case 'cls': {
        const v = parseFloat(parseKv(d).v)
        if (v > 0 && !/recentInput/.test(d)) add('warn', t, 'cls', `сдвиг раскладки ${v}: ${d.replace(/^v=\S+\s*/, '') || 'источник неизвестен'}`)
        break
      }
      case 'resize':
        add(firstFrame !== null && t > firstFrame ? 'warn' : 'info', t, 'resize', `размер окна изменился: ${d}`)
        break
      case 'orient': add('warn', t, 'orient', `поворот экрана: ${d}`); break
      case 'pageshow': if (/persisted=true/.test(d)) add('warn', t, 'bfcache', 'страница восстановлена из bfcache (pageshow persisted) — не новая загрузка'); break
      case 'sw-ctrl': add(early ? 'warn' : 'info', t, 'sw-ctrl', 'сменился controller сервис-воркера: страницу могли подменить/перезагрузить'); break
      case 'offline': case 'online': add(early ? 'warn' : 'info', t, 'net', `событие сети ${type} на старте — net-guard.js ждёт 0,7 с подтверждения`); break
      case 'vis': if (early) add('warn', t, 'vis', `visibilitychange: ${d} на старте`); break
      case 'focus': case 'blur': if (early) add('info', t, 'focus', type); break
      case 'jank': {
        const ms = parseInt(d, 10)
        add(ms >= 80 ? 'warn' : 'info', t, 'jank', `просадка кадра ${ms} мс`)
        break
      }
      case 'longtask': add(parseInt(d, 10) >= 150 ? 'warn' : 'info', t, 'longtask', `длинная задача ${d}`); break
      case 'js-error': case 'rej': case 'res-error': add('warn', t, 'error', `${type}: ${d}`); break
      case 'location.reload': add('warn', t, 'reload', `вызван location.reload: ${d}`); break
      case 'hist': add('info', t, 'hist', `history.${d}`); break
      case 'beforeunload': if (t < 6000) add('warn', t, 'unload', 'beforeunload до конца записи: страница уходит (перезагрузка/переход)'); break
      case 'pagehide': if (t < 6000) add('warn', t, 'pagehide', `pagehide на старте (${d})`); break
      case 'safe-changed': add('warn', t, 'safe-area', `safe-area-inset изменился после первого кадра: ${d} (было ${ctx.safe})`); break
      default:
    }
  }
}

export function analyzeStartLog(rec, prev = null) {
  const ev = fullEvents(rec)
  const ctx = rec.ctx || {}
  const suspects = []
  const add = (level, t, code, text) => suspects.push({ level, t, code, text })
  const at = type => ev.find(e => e[1] === type)
  const ff = at('raf-first')
  const firstFrame = ff ? ff[0] : null
  const gone = at('splash-gone')
  const goneLine = ev.find(e => e[1] === 'splash-log' && /улетает/.test(e[2]))
  const cls = ev.filter(e => e[1] === 'cls' && !/recentInput/.test(e[2])).reduce((s, e) => s + (parseFloat(parseKv(e[2]).v) || 0), 0)
  const jank = ev.filter(e => e[1] === 'jank')
  const stats = {
    firstFrame,
    splashGone: gone ? gone[0] : goneLine ? goneLine[0] : null,
    cls: Math.round(cls * 10000) / 10000,
    jank: jank.length,
    jankMax: jank.reduce((m, e) => Math.max(m, parseInt(e[2], 10) || 0), 0),
    longtasks: ev.filter(e => e[1] === 'longtask').length,
    errors: ev.filter(e => /^(js-error|rej|res-error)$/.test(e[1])).length,
  }
  stateSuspects(ev, add)
  eventSuspects(rec, ev, add, firstFrame)

  if (ctx.nav === 'reload') add('warn', 0, 'nav', `тип навигации reload — страницу перезагрузили${prev?.ctx?.nav ? ` (прошлый старт: ${prev.ctx.nav})` : ''}`)
  if (ctx.nav === 'back_forward') add('warn', 0, 'nav', 'тип навигации back_forward')
  if (ctx.nav === 'prerender') add('warn', 0, 'nav', 'тип навигации prerender')
  if (ctx.rc > 0) add('warn', 0, 'redirect', `редиректов: ${ctx.rc}`)
  if (/hidden/.test(ctx.vis || '')) add('warn', 0, 'vis', `страница стартовала скрытой (${ctx.vis})`)
  if (ctx.cold === false) add('info', 0, 'warm', `тёплый старт: это ${ctx.n}-я загрузка в этой «жизни» приложения`)
  if (ctx.sa !== true && ctx.dm !== true) add('info', 0, 'not-pwa', 'запуск НЕ как PWA с экрана «Домой» (вкладка браузера?)')
  if (firstFrame !== null && firstFrame > 1000) add('info', firstFrame, 'late-frame', `первый кадр страницы только на ${fmtT(firstFrame)} мс`)
  if (stats.splashGone !== null && stats.splashGone > 4000) add('info', stats.splashGone, 'slow-splash', `сплэш ушёл только на ${fmtT(stats.splashGone)} мс`)
  const dropped = Object.entries({ ...rec.drop, ...rec.cut }).map(([k, n]) => `${k}:${n}`)
  if (dropped.length) add('info', 0, 'trimmed', `журнал обрезан (лимит размера/числа): ${dropped.join(' ')}`)

  suspects.sort((a, b) => a.t - b.t || (a.level === b.level ? 0 : a.level === 'warn' ? -1 : 1))
  return { suspects, stats }
}
