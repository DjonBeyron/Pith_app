import { analyzeStartLog } from './analyzeStartLog.js'
import { collapseTicks, collapseSame, rowText, thinEvents, fmtT, fullEvents } from './startLogEvents.js'

// Текстовый отчёт о старте — то, что админ копирует и присылает. Чистые функции (тесты — formatStartLog.test.js).
export const yn = v => (v === true ? 'да' : v === false ? 'нет' : '?')
export const ms = v => (v === null || v === undefined ? '—' : `${fmtT(v)} мс`)
// Оболочка приложения: из кеша service worker'а («быстрый старт») или с сети; build — BUILD_ID кеша; в скобках причина, если с сети
export const shellText = c => (c.shell ? `${c.shell}${c.shellBuild ? ` (build ${c.shellBuild})` : ''}${c.shell !== 'cache' && c.shellWhy ? ` [${c.shellWhy}]` : ''}${typeof c.shellMs === 'number' ? ` ${c.shellMs}мс` : ''}` : '?')
export const gapText = g => {
  if (typeof g !== 'number' || Number.isNaN(g)) return null
  if (g < 120000) return `${Math.round(g / 1000)} с`
  return g < 7200000 ? `${Math.round(g / 60000)} мин` : `${Math.round(g / 3600000)} ч`
}

// Короткий итог для строки списка: { launch, summary: [...] }
export function startSummary(rec, prev = null) {
  const { suspects, stats } = analyzeStartLog(rec, prev)
  const ctx = rec.ctx || {}
  return {
    when: rec.id,
    launch: ctx.cold === false ? 'тёплый' : 'холодный',
    nav: ctx.nav || '?',
    standalone: ctx.sa === true || ctx.dm === true,
    variant: ctx.variant || null,
    stats,
    warns: suspects.filter(s => s.level === 'warn').length,
    parts: [
      `сплэш ушёл на ${ms(stats.splashGone)}`,
      `CLS ${stats.cls}`,
      `первый кадр ${ms(stats.firstFrame)}`,
      `jank ${stats.jank}${stats.jankMax ? ` (до ${stats.jankMax} мс)` : ''}`,
    ],
  }
}

function headerLines(rec, prev) {
  const c = rec.ctx || {}
  const { stats, suspects } = analyzeStartLog(rec, prev)
  const gap = gapText(rec.gap)
  return [
    `=== СТАРТ ${rec.id} · v${c.ver || '?'} · ВАРИАНТ=${c.variant || '?'} · оболочка=${shellText(c)} · ${c.cold === false ? `ТЁПЛЫЙ (загрузка №${c.n} в этой сессии)` : 'ХОЛОДНЫЙ (№1 в сессии)'} ===`,
    `вариант запуска: ${c.variant || '? (запись до эксперимента)'} · применено: ${c.vfx || '?'} (cs/tc = есть ли meta color-scheme / theme-color, sch = inline color-scheme)`,
    `навигация: ${c.nav || '?'} · redirects=${c.rc ?? '?'} · transferSize=${c.size ?? '?'}${gap ? ` · с прошлого старта: ${gap}` : ''}`,
    `режим: navigator.standalone=${yn(c.sa)} · display-mode:standalone=${yn(c.dm)} · visibility=${c.vis || '?'} · referrer=${c.ref || '-'} · url=${c.url || '?'}`,
    `экран: screen=${c.scr || '?'}@${c.dpr || '?'}x · окно=${c.win || '?'} · safe-area(t/r/b/l)=${c.safe || '?'} · orientation=${c.or ?? '?'}`,
    `тема: dark=${yn(c.dark)} · reducedMotion=${yn(c.rm)} · sw-controller=${c.sw || '?'} · location.reload=${c.reloadHook || '?'}`,
    `UA: ${c.ua || '?'}`,
    `итог: первый кадр ${ms(stats.firstFrame)} · сплэш ушёл ${ms(stats.splashGone)} · CLS ${stats.cls} · jank ${stats.jank}${stats.jankMax ? ` (макс ${stats.jankMax} мс)` : ''} · longtask ${stats.longtasks} · ошибок ${stats.errors} · запись закончена: ${rec.end || '?'} на ${ms(rec.endT)}`,
    '',
    `--- ПОДОЗРЕНИЯ (${suspects.length}) ---`,
    ...(suspects.length ? suspects.map(s => `${s.level === 'warn' ? '!' : 'i'} t=${fmtT(s.t)}ms | ${s.code} | ${s.text}`) : ['нет']),
  ]
}

// Таймлайн: `t=123ms | событие | детали`; серии «без изменений» схлопнуты
function timelineLines(rec, compact) {
  if (compact) return collapseSame(thinEvents(fullEvents(rec))).map(rowText) // «Скопировать все»: tick реже, одинаковые подряд — одной строкой
  return collapseTicks(fullEvents(rec)).map(e => {
    if (e.tick) return e.n > 1 ? `t=${fmtT(e.t)}..${fmtT(e.to)}ms | tick | без изменений (x${e.n})` : `t=${fmtT(e.t)}ms | tick | без изменений`
    return `t=${fmtT(e.t)}ms | ${e.type} | ${e.detail}`
  })
}

export const SAMPLE_LEGEND = 'sample = только изменившиеся поля: bg/bb фон html/body, so/sd/dt сплэш (прозрачность/display/мс кадра), fd проявление лого, lg рамка лого x,y,wxh, rt детей в #root, ng экран связи, fn шрифты, sa safe-area t/r/b/l, iw/ch/fh/vv размеры окна (innerW×H / clientHeight / fixed-область / visualViewport), sy scrollY/body/html, nv нижняя панель x,y,wxh/position, fe/fw лента .feedV2/.feedSwiper, r0 первый элемент #root, ep верхний элемент в центре, eu элемент под центром БЕЗ сплэша / его фон, eo первый непрозрачный слой под центром, k1..k4 то же в углах, vs видео (rs readyState, ct время>0, pa пауза), vo/vr/vp/ps его прозрачность/рамка/постер'

// compact: для «Скопировать все» — tick реже, повторы схлопнуты
export function formatStartLog(rec, prev = null, compact = false) {
  return [...headerLines(rec, prev), '', `--- ТАЙМЛАЙН (${SAMPLE_LEGEND}) ---`, ...timelineLines(rec, compact)].join('\n')
}

// Несколько стартов подряд, старые первыми; предыдущий старт нужен для сравнения типа навигации
export function formatStartLogs(list) {
  return list.map((r, i) => formatStartLog(r, list[i - 1] || null, true)).join('\n\n\n')
}
