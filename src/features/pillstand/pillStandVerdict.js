// Как засчитана цель стенда пилюль — для шапки и хроники отчёта «📤 Отправить» (v3.3.180): по черновику, по итогу или правилом честного зачёта слова (wordEarRule.js: «ждали итог»), исход ✓ / ✗ / —.
// Источник — события цели: 'wl' { kind: 'ear', text } (журнал правила слова), 'result', 'listen' (счёт слушателя слов), 'word' (слова слушателя фраз: draft — черновиком), 'vosk-final'. Чистые функции.
const q = t => `«${t ?? ''}»`

/** События одной цели → { mark: '✓' | '✗' | '—', how, ear: [строки правила слова] } */
export function targetVerdict(events) {
  const ear = events.filter(e => e.k === 'wl' && e.kind === 'ear').map(e => String(e.text ?? ''))
  const res = [...events].reverse().find(e => e.k === 'result')
  const mark = !res ? '—' : res.ok ? '✓' : '✗'
  const waited = ear.some(t => /жду итог|прошу итог/.test(t))
  const finalOk = ear.find(t => /^итог .* — зачёт$/.test(t))
  const finalNo = ear.filter(t => /^итог .* — не засчитано/.test(t))
  const draftOk = ear.find(t => /^черновик .* — зачёт$/.test(t))
  let how
  if (res?.ok && finalOk) how = `по итогу — правило слова: ждали итог (${finalOk.replace(/ — зачёт$/, '')})`
  else if (res?.ok && draftOk) how = `по черновику — правило слова: ${draftOk.replace(/ — зачёт$/, '').replace(/^черновик /, '')}`
  else if (res?.ok) {
    const hitAt = events.find(e => (e.k === 'listen' && e.seq?.length) || e.k === 'phrase')?.t ?? res.t
    const words = events.filter(e => e.k === 'word' && !e.gone)
    const byFinal = words.length ? words.every(w => !w.draft) : events.some(e => e.k === 'vosk-final' && e.t <= hitAt)
    how = byFinal ? 'по итогу' : `по черновику${waited ? '' : ' (правило слова не ждало)'}`
  } else if (finalNo.length) how = `не засчитано правилом слова: ${finalNo.map(t => t.replace(/ — не засчитано.*$/, '')).join('; ')}`
  else how = res ? 'нет зачёта' : 'без исхода'
  return { mark, how, ear }
}

/** «#4 «wonderful» ✓ по итогу — …» */
export const verdictLine = (target, v) => `#${(target.n ?? 0) + 1} ${q(target.say)} ${v.mark} ${v.how}`
