// Удержание ПОСЛЕДНЕГО слова фразы в черновике (проход 1 «по слову», v3.3.314; владелец: «слишком предсказывает Vosk, особенно в последнем слове фразы»). Журнал 2026-11-20: первый черновик захода Vosk
// часто угадывает по первому звуку и через 170–270 мс переписывает («is» → «the», «in» → «brother», «can» → «me», «what» → «your»). Для середины фразы это не страшно (слово откатится), а последнее слово сразу
// закрывает фразу: «100 % через 97 мс, последнее слово пришло черновиком». Правило: последнее слово фразы, стоящее ХВОСТОМ черновика, принимается, только когда хвост не менялся TAIL_HOLD_MS; итог захода принимает сразу.
// v3.3.317 (журнал владельца 23:26: сказал «фриз» вместо «from» — черновик «you from» устоялся и фраза засчиталась): устоявшийся черновик тоже врёт (закрытый словарь подставляет слово цели), а итог захода чужое слово
// отдаёт как «[unk]» (там же: черновик «are you you» → итог «are you [unk]»). Поэтому последнее слово черновиком не принимается ВОВСЕ: хвост устоялся — слушатель просит итог захода (≈ 100 мс), решает итог.
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

/** Разбор full (с хвостом) → тот же, но ПЕРВОЕ и ПОСЛЕДНЕЕ слово фразы сняты, если без хвоста (разбор cut) их нет. → { scores, held: [ключи кандидатов, где слово придержано], first: придержано только первое слово }.
 * v3.3.321 — и первое слово (владелец четыре журнала подряд: «первое слово само» — шум, дыхание, щелчок 0,13 с: Vosk отдаёт черновик «where» через 100 мс звука, а итог захода его не подтверждает). */
export function holdLast(full, cut, holdFirst = true) {
  const held = []
  let first = true // придержано только первое слово (последнее — нет): итог просим после паузы голоса, чтобы не рвать слитную речь
  const scores = full.map((s, n) => {
    const drop = (holdFirst ? [0, s.hits.length - 1] : [s.hits.length - 1]).filter(i => i >= 0 && s.hits[i] && !cut[n]?.hits[i])
    if (!drop.length) return s
    held.push(s.key); if (drop.includes(s.hits.length - 1)) first = false
    const hits = s.hits.map((h, k) => h && !drop.includes(k)), ok = hits.filter(Boolean).length
    return { ...s, hits, ok, ratio: hits.length ? ok / hits.length : 0 }
  })
  return { scores, held, first: first && held.length > 0 }
}
