import { useEffect } from 'react'
import { pLog } from '../../../../shared/lib/debug.js'

// Диагностика «капсула моргнула: тело исчезло на миг, пока я говорил» (владелец 2026-11-25, iPhone). В Chromium покадровый замер (_stand/race/shoot-pillblink.mjs) пропаж тела не нашёл: узел, display, visibility,
// opacity и рамка летящей пилюли не меняются ни на черновике, ни на промахе, ни на зачёте — остаётся слой композитора iOS. Чтобы в следующий раз знать, ЧТО менялось на пилюле в момент мигания, журнал пишет
// «[pill] …»: какие признаки-слои включились / выключились на ЛЕТЯЩЕЙ пилюле (заливка пошла data-live + кольцо data-ring, промах data-wrong, щелчок data-lock, …), сколько узлов добавлено / убрано внутри неё
// (вспышки, пузыри). Это и есть ответ на «что менялось в момент мигания».
// Цена (второй цикл оптимизации, 2026-11-26): раньше наблюдатель сразу после каждой смены читал стили пилюли (getComputedStyle) — в кадре ответа это вынужденный пересчёт стилей посреди записей движка (у владельца 4–19 мс в кадре ответа),
// а пользы не дал: в журнале 2026-11-26 пилюля «моргнула» при включённой диагностике, и ни одна из 224 строк «[pill]» не показала «тело не видно» — мигание стилями не ловится (слой композитора iOS). Теперь в момент смены стили
// НЕ читаются: пишутся только признаки и счёт узлов. Видимость проверяется выборочно — один раз на пачку смен, через FOLD_MS после первой (в таймере, а не в кадре ответа; к этому времени стили уже посчитаны),
// и только у пилюли, которая ещё летит: «… ; спустя 250 мс видна» или «⚠ тело не видно — opacity 0.40».
// Только чтение: наблюдатель один на поле (не по одному на пилюлю), смены одной пилюли за FOLD_MS сливаются в одну строку. Работает только при отладочном интерфейсе (WordLaneGame → WordLanePills watch).
export const WATCH_ATTRS = ['data-live', 'data-ring', 'data-wrong', 'data-lock', 'data-full', 'data-fail', 'data-rise', 'data-reveal', 'data-held']
export const FOLD_MS = 250
const QUIET = ['data-rise', 'data-fail', 'data-reveal', 'data-coast', 'data-faded', 'data-spent'] // пилюля уже уходит (взлёт, «не успел», догорает) — её прозрачность меняется по замыслу

/** Пачка записей MutationObserver → Map(пилюля → { attrs: Map(имя → '+' | '−'), added, removed }). pillOf(node) — пилюля, которой принадлежит узел (или null) */
export function foldPillRecords(records, pillOf) {
  const out = new Map()
  const slot = el => { if (!out.has(el)) out.set(el, { attrs: new Map(), added: 0, removed: 0 }); return out.get(el) }
  for (const r of records) {
    const el = pillOf(r.target)
    if (!el) continue
    if (r.type === 'attributes') { if (r.target === el) slot(el).attrs.set(r.attributeName, el.hasAttribute(r.attributeName) ? '+' : '−') }
    else if (r.type === 'childList') { const s = slot(el); s.added += r.addedNodes?.length ?? 0; s.removed += r.removedNodes?.length ?? 0 }
  }
  return out
}

/** Видно ли тело пилюли по стилям: { ok, why } */
export function pillSeen(el, style = globalThis.getComputedStyle) {
  if (!el.isConnected) return { ok: false, why: 'узел вне документа' }
  const cs = style(el)
  if (cs.display === 'none') return { ok: false, why: 'display none' }
  if (cs.visibility !== 'visible') return { ok: false, why: `visibility ${cs.visibility}` }
  if (+cs.opacity < 1) return { ok: false, why: `opacity ${(+cs.opacity).toFixed(2)}` }
  return { ok: true, why: 'видна' }
}

/** Строка журнала о смене на пилюле; null — писать нечего (пилюля не в руках движка и не возвращается в пул сейчас). Стили не читает */
export function pillLine(el, change) {
  const attrs = [...change.attrs].filter(([a]) => a !== 'data-held').map(([a, s]) => `${s}${a.replace('data-', '')}`)
  const nodes = change.added || change.removed ? `узлов +${change.added} −${change.removed}` : ''
  if (!attrs.length && !nodes) return null
  return `[pill] №${el.getAttribute('data-testid')?.split('-').pop() ?? '?'} «${el.getAttribute('data-cap') ?? ''}» дорожка ${el.getAttribute('data-lane') ?? '—'}: ${[attrs.join(' '), nodes].filter(Boolean).join('; ')}`
}

/** Хвост строки — выборочная проверка видимости спустя FOLD_MS: летящая пилюля должна быть видна; уходящая (взлёт, «не успел», догорает) гаснет по замыслу, вернувшаяся в пул не проверяется */
export function pillSeenTail(el, seen = pillSeen) {
  if (!el.hasAttribute('data-held')) return '; уже в пуле'
  const s = seen(el)
  return `; спустя ${FOLD_MS} мс ${s.why}${!s.ok && !QUIET.some(a => el.hasAttribute(a)) ? ' ⚠ тело не видно' : ''}`
}

/** Наблюдать за пилюлями поля root → stop(). Летящая пилюля — data-held; смены у пилюль в пуле не пишем. В обратном вызове наблюдателя — ни одного чтения стилей и размеров */
export function watchPills(root, { log = pLog, Observer = globalThis.MutationObserver, seen = pillSeen } = {}) {
  if (!root || !Observer) return () => {}
  const pillOf = n => (n?.nodeType === 1 ? n : n?.parentElement)?.closest?.('.wlPill') ?? null
  const last = new Map() // пилюля → строка: смены одной пилюли за FOLD_MS сливаются
  let alive = true
  const flush = el => { const line = last.get(el); if (!line || !alive) return; last.delete(el); let tail = ''; try { tail = pillSeenTail(el, seen) } catch { /* диагностика не мешает игре */ } log(line + tail) }
  const obs = new Observer(records => {
    for (const [el, change] of foldPillRecords(records, pillOf)) {
      if (!el.hasAttribute('data-held')) continue
      const line = pillLine(el, change)
      if (!line) continue
      const had = last.get(el)
      last.set(el, had ? `${had} ‖ ${line.replace(/^\[pill\] №\S+ «[^»]*» дорожка \S+: /, '')}` : line)
      if (!had) setTimeout(() => flush(el), FOLD_MS)
    }
  })
  obs.observe(root, { subtree: true, attributes: true, attributeFilter: WATCH_ATTRS, childList: true })
  return () => { alive = false; obs.disconnect(); last.clear() }
}

/** Хук поля пилюль: наблюдатель только при отладочном интерфейсе (on = f.dbg.enabled — тот же признак, что у шестерёнки и журнала; у ученика не работает) */
export function usePillWatch(rootRef, on = false) {
  useEffect(() => (on ? watchPills(rootRef.current) : undefined), [rootRef, on])
}
