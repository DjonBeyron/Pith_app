// Имена выходов и итогов модуля «Сказать фразу» — крошечный файл без импортов: его читают и плеер (sayPairSkip.js, useGraphPlayer.js),
// и редактор схем, и панель, не таща за собой код распознавания речи в основной чанк.
// У ноды ДВА выхода (триггера): say_done — «верный» (проверка пройдена) и say_wrong — «неверный» (три неудачные попытки).
// say_skip — СТАРОЕ имя второго выхода («Я не могу говорить», до перехода на пару верный/неверный): в сохранённых уроках оно ещё
// встречается и читается как «неверный» (SAY_WRONG_LEGACY). Итог панели (то, что она отдаёт в onDone): say_done | say_wrong | say_cant;
// say_cant («Я не могу говорить») — не триггер ноды, плеер переводит его в выход «верный» и пропускает сообщение-успех (sayPairSkip.sayExit).
export const SAY_DONE = 'say_done'
export const SAY_WRONG = 'say_wrong'
export const SAY_WRONG_LEGACY = 'say_skip'
export const SAY_CANT = 'say_cant'

/** Триггер «неверный» ноды: новое имя, иначе старое (say_skip). Берётся первый ПОДКЛЮЧЁННЫЙ (then), как и везде в плеере */
export function wrongTrigger(triggers = []) {
  const list = triggers ?? []
  return list.find(t => t.if === SAY_WRONG && t.then) ?? list.find(t => t.if === SAY_WRONG_LEGACY && t.then) ?? null
}

const byKind = (triggers, kind) => (triggers ?? []).find(t => t.if === kind)

/** Выход «неверный» для РЕДАКТОРА: say_wrong, а в старых уроках — say_skip или второй триггер по порядку (даже неподключённый) */
export const findWrongOut = triggers => wrongTrigger(triggers) ?? byKind(triggers, SAY_WRONG) ?? byKind(triggers, SAY_WRONG_LEGACY) ?? (triggers ?? [])[1]

/**
 * Редактор схем: поставить связь одному из двух выходов (ifVal — say_done | say_wrong, then — id ноды или пусто). Возвращает ровно пару
 * [say_done, say_wrong]: id триггеров сохраняются, старое имя say_skip становится say_wrong (старые уроки переезжают на новое имя при первой правке связи).
 */
export function setSayExit(triggers, ifVal, then, newId = () => crypto.randomUUID()) {
  const cur = { [SAY_DONE]: byKind(triggers, SAY_DONE) ?? (triggers ?? [])[0], [SAY_WRONG]: findWrongOut(triggers) }
  cur[ifVal] = { ...cur[ifVal], then: then || null }
  return [SAY_DONE, SAY_WRONG].map(k => ({ id: cur[k]?.id ?? newId(), if: k, then: cur[k]?.then ?? null }))
}
