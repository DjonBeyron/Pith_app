// Неозвученные реплики Пита в «Встряхни память» (замечание владельца с iPhone, 2026-11-07: «перед этапами какое-то время Пит молчит»). Пока реплика не озвучена (rotate_cat_lines без url), раньше её «длина»
// считалась по тексту (lineMs: 65 мс на букву ≈ 3–4 с) плюс LINE_PAUSE_MS 600 мс (эхо динамика) — всё это время экран стоял с плашкой и тишиной, а Пит считался занятым (пилюли ждали pitLeft).
// Теперь в гонке неозвученная реплика помечается silent (raceLinesOf, WordLaneGame): её длина — SILENT_LINE_MS, пауза после — CAPTION_READ_MS (эха нет — ждать нечего). С задержкой реплики на плашке
// (LINE_AT_MS 250) плашка держится ≈ 900 мс + 250 мс на чтение подписи. Текст реплики виден подписью на плашке (plateCap → WordLaneTurnPlate .wlTurnCap, на заставке — RaceChargePlate).
// Озвученная реплика — как раньше (до конца звука + пауза). Журнал: «[say] реплика <id> без озвучки: подпись N мс» — один раз на реплику за игру (createSilentNote, useCatLines).
export const SILENT_LINE_MS = 650   // «длина» неозвученной реплики (lineMs для line.silent, без поправки на скорость голоса)
export const CAPTION_READ_MS = 250  // пауза после неё: дочитать подпись (вместо LINE_PAUSE_MS и паузы плашки)
export const SILENT_HOLD_MS = 1150   // плашка с неозвученной репликой держится не дольше: 900 мс + CAPTION_READ_MS (минимум стадии st.ms — RACE_ANNOUNCE_MS 1,7 с — для неё урезается)

/** Реплики для гонки: у неозвученных — метка silent (lineMs → SILENT_LINE_MS, пауза ≤ CAPTION_READ_MS); озвученные без изменений */
export function raceLinesOf(lines) {
  if (!lines) return lines
  return Object.fromEntries(Object.entries(lines).map(([id, l]) => [id, l && typeof l === 'object' && !l.url ? { ...l, silent: true } : l]))
}

/** Пауза после реплики: у неозвученной — не дольше CAPTION_READ_MS */
export const silentPause = (line, pause) => (line?.silent ? Math.min(pause, CAPTION_READ_MS) : pause)

/** Минимум стадии с репликой: у неозвученной — не дольше SILENT_HOLD_MS (озвученная держит плашку после речи st.ms, как раньше) */
export const silentMin = (line, ms) => (line?.silent && ms > 0 ? Math.min(ms, SILENT_HOLD_MS) : ms)

/** Подпись плашки: текст реплики стадии, если она не озвучена (иначе пусто — Пит скажет её голосом) */
export function plateCaption(lines, id) {
  const l = id ? lines?.[id] : null
  return l?.silent ? l.caption ?? l.text ?? '' : ''
}

/**
 * Подпись реплики над лентой (демо «Скажи», race_phrase_again перед проходом 2): ТОЛЬКО если реплика не озвучена — нет url в rotate_cat_lines (или её нет в настройках / они не загружены).
 * Озвученная — '' (владелец, 2026-11-07: «сабы Пита я не просил»): озвучит реплику в админке — подпись исчезнет сама. Текст: caption → text → fallback (каталог)
 */
export function lineCaption(lines, id, fallback = '') {
  const l = id ? lines?.[id] : null
  return l?.url ? '' : l?.caption || l?.text || fallback
}

/** Журнал «[say] реплика <id> без озвучки: подпись N мс» — один раз на реплику. → note(id, ms) */
export function createSilentNote(log) {
  const seen = new Set()
  return (id, ms) => {
    if (seen.has(id)) return
    seen.add(id)
    try { log(`[say] реплика ${id} без озвучки: подпись ${Math.round(ms)} мс`) } catch { /* журнал не мешает игре */ }
  }
}
