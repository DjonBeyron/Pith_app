// Удержание ПОСЛЕДНЕГО слова фразы в черновике (проход 1 «по слову», v3.3.314; владелец: «слишком предсказывает Vosk, особенно в последнем слове фразы»). Журнал 2026-11-20: первый черновик захода Vosk
// часто угадывает по первому звуку и через 170–270 мс переписывает («is» → «the», «in» → «brother», «can» → «me», «what» → «your»). Для середины фразы это не страшно (слово откатится), а последнее слово сразу
// закрывает фразу: «100 % через 97 мс, последнее слово пришло черновиком». Правило: последнее слово фразы, стоящее ХВОСТОМ черновика, принимается, только когда хвост не менялся TAIL_HOLD_MS; итог захода принимает сразу.
// Чистая логика над часами now(): таймер повторной проверки ведёт слушатель (racePhraseListen.js).
export const TAIL_HOLD_MS = 300

export function createTailHold({ now = () => Date.now(), holdMs = TAIL_HOLD_MS } = {}) {
  let key = '', at = -Infinity
  return {
    /** Новый черновик захода: хвост — его последнее слово (и место в заходе) */
    partial(text) { const ws = String(text ?? '').split(/\s+/).filter(Boolean), k = `${ws.length}|${ws[ws.length - 1] ?? ''}`; if (k !== key) { key = k; at = now() } },
    /** Итог захода / новый заход / сброс */
    clear() { key = ''; at = -Infinity },
    /** Сколько мс хвосту ещё стоять (0 — устоялся или хвоста нет) */
    left: () => (key ? Math.max(0, holdMs - (now() - at)) : 0),
  }
}

/** Текст без последнего слова */
export const cutTail = text => String(text ?? '').split(/\s+/).filter(Boolean).slice(0, -1).join(' ')

/** Разбор full (с хвостом) → тот же, но последнее слово фразы снято, если без хвоста (разбор cut) его нет. → { scores, held: [ключи кандидатов, где слово придержано] } */
export function holdLast(full, cut) {
  const held = []
  const scores = full.map((s, n) => {
    const i = s.hits.length - 1
    if (i < 0 || !s.hits[i] || cut[n]?.hits[i]) return s
    held.push(s.key)
    const hits = s.hits.map((h, k) => h && k !== i), ok = hits.filter(Boolean).length
    return { ...s, hits, ok, ratio: hits.length ? ok / hits.length : 0 }
  })
  return { scores, held }
}
