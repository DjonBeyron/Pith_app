// Таблица прогона «Записи набора» (scripts/voice-set-run.mjs, CONCEPT_VOICESET.md): из строк результатов — текст: по видам (whole / quiet / fast должны засчитываться; nolast / half / «не слова» /
// тишина / фон — нет; фраза целиком — чистый зачёт, с недоговорённым последним словом — чистого зачёта быть не должно), по словам, список провалов (что услышал Vosk, причина из журнала
// [word-ear]), сверка уровней с манифестом. Строка результата (одна на прогон клипа; --repeat — несколько на клип): { i, run, file, kind, text, variant, far, expect, hit, ok, hitAt, fromEndMs, ratio, partials, finals, ear, tapPeak, tapNoise, tapRms, engPeak, engRms,
// rmsPeak, rmsNoise, clipRms, gamePeak }. Чистые функции — без файлов и браузера.
const med = a => { const s = a.filter(v => v != null && Number.isFinite(v)).sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null }
const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : null }
const f2 = v => (v == null ? '—' : v.toFixed(2).replace('.', ','))
const pad = (s, n) => String(s).padEnd(n)
export const VARIANT_ORDER = ['whole', 'quiet', 'fast', 'nolast', 'half', 'whole-far', 'nolast-far', 'phrase whole', 'phrase cutlast', 'noise', 'long']
export const groupOf = r => (r.kind === 'word' ? `${r.variant}${r.far ? '-far' : ''}` : r.kind === 'phrase' ? `phrase ${r.variant}` : r.kind)
const WANT = { hit: 'зачёт', none: 'нет зачёта' }

/** Верно ли сработало: слово / шум — зачёт как ожидали; фраза целиком — чистый зачёт (ratio 1), с недоговорённым словом — чистого быть не должно */
export function rowOk(r) {
  if (r.kind === 'phrase') return r.expect === 'hit' ? r.hit && r.ratio >= 1 : !(r.hit && r.ratio >= 1)
  return r.expect === 'hit' ? !!r.hit : !r.hit
}

const heard = r => {
  const fin = (r.finals ?? []).filter(f => f.text || f.words?.length).map(f => `«${f.text}»${f.words?.length ? ` (${f.words.map(w => `${w.w} ${f2(w.conf)}`).join(', ')})` : ''}${f.by ? ` ${f.by}` : ''}`).join(' → ')
  const drafts = [...new Set((r.partials ?? r.drafts ?? []).map(p => p[1]).filter(Boolean))].slice(-4).join(' | ')
  return `черновики: ${drafts || '—'}; итог: ${fin || '—'}`
}
const why = r => { const e = (r.ear ?? (r.log ?? []).filter(t => t.includes('[phrase-ear]'))).filter(Boolean); return e.length ? e.at(-1).replace(/^-?\d+ /, '') : '' }

/** Сверка уровней прогона с манифестом. Пик куска зависит от того, как куски по 2048 кадров легли на слово (±10 %), rms всего клипа — нет: главная строка — она. micGain 1 — движок видит сырой звук */
export function levelCheck(rows, micGain = null) {
  const one = (a, b) => rows.filter(r => r[a] > 0 && r[b] > 0).map(r => r[a] / r[b])
  const line = (title, k) => (k.length ? `${title}: медиана ×${f2(med(k))}, 5–95 %: ×${f2(pct(k, 0.05))}…×${f2(pct(k, 0.95))}, вне ±10 %: ${k.filter(v => v < 0.9 || v > 1.1).length} из ${k.length}` : `${title}: нет данных`)
  return [
    line('rms всего клипа (вход прогонщика / огибающая манифеста)', one('tapRms', 'clipRms')),
    line('пик сырого звука (вход прогонщика / rmsPeak манифеста)', one('tapPeak', 'rmsPeak')),
    line('фон сырого звука (вход прогонщика / rmsNoise манифеста)', one('tapNoise', 'rmsNoise')),
    ...(micGain === 1 ? [line('уровень ДВИЖКА без усиления: rms клипа (движок / огибающая манифеста)', one('engRms', 'clipRms')), line('уровень ДВИЖКА без усиления: пик (движок / rmsPeak манифеста)', one('engPeak', 'rmsPeak'))]
      : [line('пик после усиления игры (уровень движка / gamePeak манифеста)', one('engPeak', 'gamePeak'))]),
  ]
}

/** rows — результаты прогона; info — { title, micGain, bed } → текст таблицы */
export function renderTable(rows, info = {}) {
  const out = [], cnt = a => `${a.filter(r => r.hit).length}/${a.length}`
  out.push(`== Прогон набора: ${info.title ?? ''}`.trimEnd())
  out.push(`прогонов клипов ${rows.length}; «Чувствительность микрофона» ×${info.micGain ?? '?'}; подложка между клипами: ${info.bed ?? 'нет'}; поправка тракта (шум выше 9,5 кГц по огибающей исходного звука): ${info.hf ? 'да' : 'нет'}`)
  out.push('', '== По видам (зачтено / всего)')
  const groups = [...new Set(rows.map(groupOf))].sort((a, b) => (VARIANT_ORDER.indexOf(a) + 1 || 99) - (VARIANT_ORDER.indexOf(b) + 1 || 99))
  for (const g of groups) {
    const R = rows.filter(r => groupOf(r) === g), bad = R.filter(r => !rowOk(r)).length, lat = R.filter(r => r.hit && r.fromEndMs != null).map(r => r.fromEndMs)
    out.push(`${pad(g, 15)} должно: ${pad(g === 'phrase whole' ? 'зачёт чисто' : g === 'phrase cutlast' ? 'не чисто / нет' : WANT[R[0].expect], 15)} зачтено ${pad(cnt(R), 7)} ${bad ? `✗ неверно ${bad}` : '✓'}${lat.length ? `   зачёт от конца голоса, мс: медиана ${med(lat)} (${Math.min(...lat)}…${Math.max(...lat)})` : ''}`)
  }
  const words = [...new Set(rows.filter(r => r.kind === 'word').map(r => r.text))], cols = groups.filter(g => rows.some(r => r.kind === 'word' && groupOf(r) === g))
  if (words.length) {
    out.push('', `== По словам (зачтено / всего): ${cols.join(' · ')}`)
    for (const w of words) out.push(`  ${pad(w, 13)} ${cols.map(g => pad(cnt(rows.filter(r => r.kind === 'word' && r.text === w && groupOf(r) === g)), 5)).join(' · ')}${rows.some(r => r.kind === 'word' && r.text === w && !rowOk(r)) ? '  ✗' : ''}`)
  }
  const byClip = new Map()
  for (const r of rows) byClip.set(r.i, [...(byClip.get(r.i) ?? []), r])
  const reps = Math.max(1, ...[...byClip.values()].map(a => a.length))
  if (reps > 1) { // каждый клип прогнан несколько раз (--repeat): подача идёт в реальном времени, пограничные клипы от прогона к прогону срабатывают по-разному
    const mixed = [...byClip.values()].filter(a => a.some(rowOk) && !a.every(rowOk))
    out.push('', `== Устойчивость (каждый клип × ${reps})`, `верно во всех повторах: ${[...byClip.values()].filter(a => a.every(rowOk)).length} клипов, неверно во всех: ${[...byClip.values()].filter(a => !a.some(rowOk)).length}, по-разному: ${mixed.length}`)
    for (const a of mixed) out.push(`  ${a[0].file} «${a[0].text}» — верно ${a.filter(rowOk).length} из ${a.length} (${a.map(r => (r.hit ? 'зачёт' : 'нет')).join(', ')})`)
  }
  const bad = rows.filter(r => !rowOk(r)), fails = bad.filter((r, k) => bad.findIndex(x => x.i === r.i) === k)
  out.push('', `== Провалы (${reps > 1 ? `${fails.length} клипов; прогонов ${bad.length}` : fails.length} из ${rows.length})`)
  for (const r of fails) {
    const all = byClip.get(r.i)
    out.push(`#${String(r.i + 1).padStart(3, '0')} ${r.file} «${r.text}»${r.target && r.target !== r.text ? ` (цель «${r.target}»)` : ''} — ждали: ${WANT[r.expect]}, вышло: ${r.hit ? `зачёт${r.ratio != null ? ` ratio ${f2(r.ratio)}` : ''} на ${r.hitAt} мс` : 'нет зачёта'}${all.length > 1 ? ` (неверно ${all.filter(x => !rowOk(x)).length} из ${all.length} повторов)` : ''}`)
    out.push(`      Vosk — ${heard(r)}`)
    if (why(r)) out.push(`      причина: ${why(r)}`)
    out.push(`      уровень движка до ${r.engPeak ?? '—'} (манифест ${r.gamePeak ?? '—'}), голос по манифесту ${r.manifestVoiceMs ?? '—'} мс${r.note ? `; ${r.note}` : ''}`)
  }
  out.push('', '== Сверка уровней', ...levelCheck(rows, info.micGain))
  const ok = rows.length - bad.length
  out.push('', `ИТОГО: верно ${ok} из ${rows.length} (${rows.length ? Math.round(ok / rows.length * 100) : 0} %)`)
  return out.join('\n')
}
