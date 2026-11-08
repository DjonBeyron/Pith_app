// Журнал заливки круга 2 «Скажи» — строки «[fill] …» (замечание владельца 7: «при сказанной полной фразе пилюля не заполняется какое-то время, а потом дозаполняется — добавь дебаг»).
// Сцена (через racePhraseSayTrace.js) зовёт start при выезде пилюли, word / phrase — на событиях слушателя (причина следующей смены цели), frame — каждый кадр с целью и тем, что на экране.
//  • смена цели: «[fill] +N мс: слово k «…» черновик|итог → цель 0,50, экран 0,31» (N — мс от выезда пилюли; причина — последнее событие слушателя до смены);
//  • пока экран не догнал цель — не чаще FILL_LOG_EVERY_MS: «[fill] экран 0,42 → 0,50»;
//  • взлёт: «[fill] 100 % через N мс после последнего слова, взлёт +M мс» (M — от выезда пилюли).
// По журналу видно, где пауза: пришло ли слово поздно (строки [phrase-ear] с тем же временем) или экран долго догонял цель. Чистая логика: время — аргументом, строки — в log.
export const FILL_LOG_EVERY_MS = 250
const EPS = 0.005
const num = v => (Number(v) || 0).toFixed(2).replace('.', ',')

export function createFillLog({ log = () => {} } = {}) {
  let born = null, goal = 0, cause = null, lastAt = -Infinity, fullAt = null, wordAt = null
  const rel = t => `+${Math.round(t - born)} мс`
  return {
    /** Пилюля выехала (t — сейчас): отсчёт заново */
    start(t) { born = t; goal = 0; cause = null; lastAt = -Infinity; fullAt = null; wordAt = null },
    /** Слово цели услышано (onWord): { index, text, draft } — причина следующей смены цели */
    word(e, t) { cause = `слово ${(e?.index ?? 0) + 1} «${e?.text ?? '?'}» ${e?.draft ? 'черновик' : 'итог'}`; wordAt = t },
    /** Итог фразы (onPhrase, ratio — доля слов): цель — 100 % */
    phrase(ratio) { cause = `итог фразы, слов ${Math.round((Number(ratio) || 0) * 100)} %` },
    /** Кадр: g — цель заливки, s — что на экране */
    frame(t, g, s) {
      if (born == null) return
      if (Math.abs(g - goal) > 1e-6) { goal = g; lastAt = t; log(`[fill] ${rel(t)}: ${cause ?? 'без события'} → цель ${num(g)}, экран ${num(s)}`); return }
      if (Math.abs(s - g) > EPS && t - lastAt >= FILL_LOG_EVERY_MS) { lastAt = t; log(`[fill] экран ${num(s)} → ${num(g)}`) }
    },
    /** Заливка на экране впервые дошла до 100 %; last — когда впервые услышано последнее новое слово (null — по журналу слов) */
    full(t, last = null) { fullAt = t; if (last != null) wordAt = last },
    /** Взлёт (зачёт) */
    rise(t) {
      if (born == null) return
      const full = fullAt ?? t
      log(`[fill] 100 % через ${wordAt == null ? '—' : Math.round(full - wordAt)} мс после последнего слова, взлёт ${rel(t)}`)
    },
  }
}
