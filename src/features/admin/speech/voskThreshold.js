// Порог уверенности слова Vosk (setWords даёт conf у каждого слова): таблица «порог → принято правильных / отвергнуто неверных / ложных отказов»
// по накопленным прогонам (аналог таблицы порогов мелькания) и совет простыми словами. Чистые функции.
// Идея: приложение принимает слово как «услышано», только если conf ≥ порога. «Правильные» — прогоны режима «ПРАВИЛЬНО» (контроль) шагов A и пар C.
// «Неверные» — прогоны «С ОШИБКОЙ», ловушки и тишина. Неверный вход ПРИНЯТ ЗРЯ, если движок выдал на нём верную форму (подменил)
// или слово из словаря (ловушка/тишина) с уверенностью ≥ порога. Нет уверенности (conf не пришла) — считаем 1: порог такое слово не отсекает.

export const CONF_THRESHOLDS = [0.3, 0.5, 0.7, 0.9]

const isRight = r => r.mode === 'control' && (r.kind === 'ctx' || r.kind === 'pair')
const isWrong = r => r.mode === 'error' || r.kind === 'trap' || r.kind === 'silence'
const conf = r => (typeof r.kc === 'number' ? r.kc : 1)
// неверный вход, который движок выдал за «верное» (подмена верной формой / слово из словаря на ловушке)
const accepted = r => (r.kind === 'trap' || r.kind === 'silence' ? r.out === 'accepted' : r.mode === 'error' && r.out === 'swapped' && r.sw === r.keys?.ok)

/** { nRight, nWrong, rows: [{ t, accepted — правильных принято, rejected — неверных отвергнуто, refused — ложных отказов }] } */
export function thresholdTable(runs, thresholds = CONF_THRESHOLDS) {
  const right = (runs || []).filter(isRight)
  const wrong = (runs || []).filter(isWrong)
  const heardRight = right.filter(r => r.out === 'asis')
  return {
    nRight: right.length, nWrong: wrong.length,
    rows: thresholds.map(t => ({
      t,
      accepted: heardRight.filter(r => conf(r) >= t).length,
      rejected: wrong.length - wrong.filter(r => accepted(r) && conf(r) >= t).length,
      refused: heardRight.filter(r => conf(r) < t).length,
    })),
  }
}

/** Разброс уверенностей слов по всем прогонам: { n, min, max, distinct }. Если везде 1 — порог бесполезен */
export function confSpread(runs) {
  const v = (runs || []).flatMap(r => (r.ws || []).map(w => w[1])).filter(c => typeof c === 'number')
  return { n: v.length, min: v.length ? Math.min(...v) : null, max: v.length ? Math.max(...v) : null, distinct: new Set(v).size }
}

export function spreadText(s) {
  if (!s.n) return 'уверенность слов: данных нет'
  if (s.distinct <= 1) return `уверенность слов: везде ${s.min} (${s.n} слов) — значения НЕ различаются, порог по уверенности ничего не даст`
  return `уверенность слов: от ${s.min} до ${s.max}, разных значений ${s.distinct} (слов ${s.n}) — значения различаются`
}

/** Совет: порог без ложных отказов, где отвергается больше всего неверного (при равенстве — меньший порог: безопаснее для верной речи) */
export function recommend(tab) {
  if (!tab.nRight || !tab.nWrong) return { t: null, text: `рекомендации пока нет: нужны правильные прогоны («говорю ПРАВИЛЬНО») — сейчас ${tab.nRight} — и неверные (ошибка, ловушки, тишина) — сейчас ${tab.nWrong}` }
  const r0 = tab.rows[0]
  if (tab.rows.every(r => r.accepted === r0.accepted && r.rejected === r0.rejected)) return { t: null, text: 'порог ничего не меняет на этих данных: слова с разной уверенностью не отличаются по исходу — собирайте больше прогонов' }
  const pick = list => list.reduce((b, r) => (!b || r.rejected > b.rejected || (r.rejected === b.rejected && r.t < b.t) ? r : b), null)
  const clean = tab.rows.filter(r => r.refused === 0)
  if (clean.length) {
    const b = pick(clean)
    return { t: b.t, text: `рекомендуемый порог: ${b.t} — принимает верных ${b.accepted} из ${tab.nRight}, отвергает неверных ${b.rejected} из ${tab.nWrong}, ложных отказов нет` }
  }
  const least = Math.min(...tab.rows.map(r => r.refused))
  const b = pick(tab.rows.filter(r => r.refused === least))
  return { t: b.t, text: `без ложных отказов не обойтись: лучший компромисс — порог ${b.t}: верных принято ${b.accepted} из ${tab.nRight}, неверных отвергнуто ${b.rejected} из ${tab.nWrong}, но ${b.refused} верных слов отвергнуто зря` }
}

export function thresholdLines(runs) {
  const tab = thresholdTable(runs)
  return [
    `ПОРОГ УВЕРЕННОСТИ СЛОВА (верных прогонов ${tab.nRight}, неверных ${tab.nWrong}); ${spreadText(confSpread(runs))}`,
    ...tab.rows.map(r => `  порог ${r.t}: верных принято ${r.accepted}/${tab.nRight} · неверных отвергнуто ${r.rejected}/${tab.nWrong} · ложных отказов ${r.refused}/${tab.nRight}`),
    `  ${recommend(tab).text}`,
  ]
}
