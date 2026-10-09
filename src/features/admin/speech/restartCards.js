// Простые формулировки для «Серии из 6 нажатий подряд» (надёжность перезапуска): строка попытки, вывод, время, сводка по стратегии.
// Чистые функции без React. Широкая таблица (audiostart, result, заходы) остаётся в «Подробнее».

const ERR_TEXT = { silence: 'тишина, речь не распознана', 'no-speech': 'тишина, речь не распознана', 'not-allowed': 'нет доступа к микрофону', 'service-not-allowed': 'нет доступа к распознаванию', network: 'нет связи', aborted: 'запись прервана' }

/** Что услышали в попытке: «Услышали: «hello»» / «Ничего не услышал — микрофон глухой» / «Ничего не услышал» */
export function runHeard(run) {
  if (run.cls === 'ok') return `Услышали: «${run.heard || '—'}»`
  return run.cls === 'deaf' ? 'Ничего не услышал — микрофон глухой' : 'Ничего не услышал'
}

export const GIVE_UP_TEXT = 'Микрофон не слышит: закрой приложение и открой снова'

/** Звуки перед записью простыми словами: «звуки до записи: unlock-wav, audio-play» / «звуки до записи: нет»; запись без поля — пусто */
export const runSounds = run => (run.snd == null ? '' : `звуки до записи: ${run.snd}`)

/** Заход, где все попытки (первая + 2 повтора) остались глухими — проба просит перезапустить приложение */
export const runGaveUp = run => run.cls === 'deaf' && run.attempts >= 3

/** Вывод простыми словами: { tone: 'ok'|'deaf'|'error', text } */
export function runVerdict(run) {
  if (run.cls === 'ok') return { tone: 'ok', text: `✅ слышит${run.recovered ? ' (с первого раза было глухо, помог авто-повтор)' : ''}` }
  if (run.cls === 'deaf') return { tone: 'deaf', text: '❌ глухо' }
  return { tone: 'error', text: `⚠ ошибка${run.err ? `: ${ERR_TEXT[run.err] ?? run.err}` : ''}` }
}

/** Время до результата: «ответ через 1.4 с» (нет данных — пусто) */
export const runTime = run => (typeof run.result === 'number' ? `ответ через ${(run.result / 1000).toFixed(1)} с` : '')

/** «Попытка 3 из 6 — Услышали: «hello»» */
export const runLine = (run, i, total) => `Попытка ${i + 1} из ${total} — ${runHeard(run)}`

/** Сводка по стратегии: «S1 — слышал 4 из 6, глухих 2»; серии не было — «S5 — ещё не проверяли»; идёт — с пометкой */
export function strategyLine(row) {
  if (!row.stats) return `${row.id} — ещё не проверяли`
  const s = row.stats
  const base = `${row.id} — ${row.partial ? `идёт серия, пока слышал ${s.ok} из ${s.n}` : `слышал ${s.ok} из ${s.n}`}, глухих ${s.deafRuns}`
  return s.err ? `${base}, ошибок ${s.err}` : base
}
