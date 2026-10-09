import { analyzeStartLog } from './analyzeStartLog.js'
import { collapseSame, rowText, fmtT, fullEvents, parseKv } from './startLogEvents.js'
import { yn, ms, gapText, shellText } from './formatStartLog.js'

// «Скопировать коротко»: отчёт ≤ ~6000 символов, который не обрежет чат. Контекст (3 строки), итог, подозрения и таймлайн ТОЛЬКО
// окна «за 300 мс до ухода сплэша … +2 с после» + важные события вне окна (с «!», safe-area, resize, pageshow, visibility,
// controllerchange, reload, метки приложения, видео). Одинаковые подряд строки схлопнуты. Не влезло — окно сужается.
const LIMIT = 6000
const WINDOWS = [[300, 2000], [300, 1200], [200, 700], [100, 400]]
const KEEP = /^(splash-gone|safe-changed|sab-|resize|orient|pageshow|pagehide|vis$|sw-ctrl|location\.reload|beforeunload|video|mark:|raf-first|raf-stop|js-error|rej|res-error|offline|online|cls|splash-log)/
const LEGEND = 'sample: sa=safe-area t/r/b/l, iw/ch/fh/vv=окно, nv=нижняя панель, fe/fw=лента, r0=#root, ep=верх. элемент в центре, eu/eo=слой под центром без сплэша (элемент/фон), k1..4=углы, vs/vo/vr=видео, so/dt=сплэш/кадр, sy=scroll'

function head(rec, prev) {
  const c = rec.ctx || {}
  const { stats } = analyzeStartLog(rec, prev)
  const gap = gapText(rec.gap)
  return [
    `=== СТАРТ ${rec.id} · v${c.ver || '?'} · ВАРИАНТ=${c.variant || '?'} (${c.vfx || '?'}) · оболочка=${shellText(c)} · ${c.cold === false ? `ТЁПЛЫЙ №${c.n}` : 'ХОЛОДНЫЙ'} · nav=${c.nav || '?'} · standalone=${yn(c.sa)}/${yn(c.dm)}${gap ? ` · с прошлого: ${gap}` : ''} ===`,
    `экран ${c.scr || '?'}@${c.dpr || '?'}x · окно ${c.win || '?'} · safe-area(t/r/b/l) ${c.safe || '?'} · sw=${c.sw || '?'} · ${(c.ua || '').slice(0, 70)}`,
    `итог: кадр ${ms(stats.firstFrame)} · сплэш ушёл ${ms(stats.splashGone)} · CLS ${stats.cls} · jank ${stats.jank}${stats.jankMax ? `(до ${stats.jankMax})` : ''} · ошибок ${stats.errors} · запись: ${rec.end || '?'} на ${ms(rec.endT)}`,
  ]
}

function suspectLines(suspects) {
  const shown = []
  let size = 0
  for (const s of suspects) {
    const row = `${s.level === 'warn' ? '!' : 'i'} t=${fmtT(s.t)}ms | ${s.code} | ${s.text}`.slice(0, 200)
    if (size + row.length > 2500) break // подозрения не должны съесть весь лимит
    shown.push(row); size += row.length + 1
  }
  return [`--- ПОДОЗРЕНИЯ (${suspects.length}) ---`, ...(shown.length ? shown : ['нет']), ...(shown.length < suspects.length ? [`… ещё ${suspects.length - shown.length} (в полном журнале)`] : [])]
}

function timeline(ev, suspects, gone, before, after) {
  const from = gone === null ? 0 : gone - before, to = gone === null ? 4000 : gone + after
  const warnT = new Set(suspects.filter(s => s.level === 'warn').map(s => s.t))
  const pick = ev.filter(e => (e[0] >= from && e[0] <= to) || KEEP.test(e[1]) || warnT.has(e[0]) || (e[1] === 'sample' && 'sa' in parseKv(e[2])))
  return collapseSame(pick).map(rowText)
}

export function formatStartShort(rec, prev = null) {
  const { suspects, stats } = analyzeStartLog(rec, prev)
  const ev = fullEvents(rec)
  const top = [...head(rec, prev), '', ...suspectLines(suspects), '']
  const build = (lines, b, a, cut = 0) => [...top, `--- ТАЙМЛАЙН: окно [уход сплэша −${b} … +${a}] мс и важные события${cut ? `, ранние строки опущены (${cut})` : ''}; ${LEGEND} ---`, ...lines].join('\n')
  let lines = []
  for (const [b, a] of WINDOWS) {
    lines = timeline(ev, suspects, stats.splashGone, b, a)
    if (build(lines, b, a).length <= LIMIT) return build(lines, b, a)
  }
  // всё ещё длинно — отбрасываем самые ранние строки (окно растворения и конец важнее начала)
  const [b, a] = WINDOWS[WINDOWS.length - 1]
  let cut = 0
  while (lines.length > 8 && build(lines, b, a, cut).length > LIMIT) { lines = lines.slice(1); cut++ }
  return build(lines, b, a, cut).slice(0, LIMIT)
}
