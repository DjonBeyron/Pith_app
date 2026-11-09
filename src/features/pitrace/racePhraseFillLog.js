// Журнал заливки круга 2 «Скажи» — строки «[fill] …» (замечание владельца 7: «при сказанной полной фразе пилюля не заполняется какое-то время, а потом дозаполняется — добавь дебаг»).
// Сцена (через racePhraseSayTrace.js) зовёт start при выезде пилюли, word / phrase — на событиях слушателя (причина следующей смены цели), frame — каждый кадр с целью и тем, что на экране.
//  • смена цели: «[fill] +N мс: слово k «…» черновик|итог → цель 0,50, экран 0,31» (N — мс от выезда пилюли; причина — последнее событие слушателя до смены);
//  • пока экран не догнал цель — не чаще FILL_LOG_EVERY_MS: «[fill] экран 0,42 → 0,50»;
//  • взлёт: «[fill] 100 % через N мс после последнего слова, последнее слово пришло: черновиком|итогом, взлёт +M мс» (M — от выезда пилюли; «итогом» — Vosk не показал его в черновике,
//    оно пришло только итогом захода: см. «ИТОГ ПО ЗАТВОРУ» в racePhraseListen.js);
//  • откат (проход 1): «[fill] +N мс: слово 3 «meet» откат — черновик перестроился без него» (слово снова кирпичик, линия отходит, если оно было в префиксе);
//  • неверное слово (проход 1): «[fill] неверное слово «cat», ждём «want»» — кромка дёрнулась красным, заливка не менялась (racePhraseWrongWord.js);
//  • сводка хода (end — зачёт или «не успел»): «[fill] итог хода: слов N, первое слово через … мс, 100 % через … мс после последнего, макс. пауза … мс» (паузы — между первыми появлениями слов).
// По журналу видно, где пауза: пришло ли слово поздно (строки [phrase-ear] с тем же временем) или экран долго догонял цель. Чистая логика: время — аргументом, строки — в log.
import { maxPause } from './racePhrasePasses.js'

export const FILL_LOG_EVERY_MS = 250
const EPS = 0.005
const num = v => (Number(v) || 0).toFixed(2).replace('.', ',')

export function createFillLog({ log = () => {} } = {}) {
  let born = null, goal = 0, cause = null, lastAt = -Infinity, fullAt = null, wordAt = null, seen = new Map(), lastKind = null
  const rel = t => `+${Math.round(t - born)} мс`
  return {
    /** Пилюля выехала (t — сейчас): отсчёт заново */
    start(t) { born = t; goal = 0; cause = null; lastAt = -Infinity; fullAt = null; wordAt = null; seen = new Map(); lastKind = null },
    /** Слово цели услышано (onWord): { index, text, draft, gone } — причина следующей смены цели; gone — откат (проход 1): строка сразу, слово уходит из сводки */
    word(e, t) {
      if (e?.gone) { cause = `откат слова ${(e.index ?? 0) + 1} «${e.text ?? '?'}»`; seen.delete(e.index); log(`[fill] ${born == null ? '' : `${rel(t)}: `}слово ${(e.index ?? 0) + 1} «${e.text ?? '?'}» откат — черновик перестроился без него`); return }
      cause = `слово ${(e?.index ?? 0) + 1} «${e?.text ?? '?'}» ${e?.draft ? 'черновик' : 'итог'}`; wordAt = t; if (!seen.has(e?.index)) { seen.set(e?.index, t); lastKind = e?.draft ? 'черновиком' : 'итогом' } },
    /** Неверное слово (проход 1, racePhraseWrongWord.js): рывок кромки, заливка не меняется */
    wrong(word, expect) { log(`[fill] неверное слово «${word}», ждём «${expect}»`) },
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
      log(`[fill] 100 % через ${wordAt == null ? '—' : Math.round(full - wordAt)} мс после последнего слова${lastKind ? `, последнее слово пришло: ${lastKind}` : ''}, взлёт ${rel(t)}`)
    },
    /** Сводка хода (один раз: после неё отсчёт закрыт до следующего start) */
    end() {
      if (born == null) return
      const ts = [...seen.values()], first = ts.length ? Math.min(...ts) : null, last = ts.length ? Math.max(...ts) : null
      log(`[fill] итог хода: слов ${ts.length}, первое слово через ${first == null ? '—' : Math.round(first - born)} мс, 100 % ${fullAt == null || last == null ? 'не было' : `через ${Math.round(fullAt - last)} мс после последнего`}, макс. пауза ${maxPause(ts)} мс`)
      born = null
    },
  }
}
