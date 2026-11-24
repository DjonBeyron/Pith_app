import { useCallback, useEffect, useMemo, useState } from 'react'
import { saveError, mouthDone } from './timelineLineEdit.js'
import { LINE_API } from './timelineLineApi.js'
import { realignLine, watchMouth } from '../admin/speech/raceLineActions.js'

// Правка реплики Пита / Мии прямо из карточки «Таймлайна игры» (CONCEPT_TIMELINE.md, «Правка реплики из карточки»): текст, переозвучка, свой файл, «вернуть прежний текст».
// Сам хук ничего не знает о настройках: всё делает api (боевой — timelineLineApi.js, ТЕ ЖЕ функции, что у таблицы «Озвучка Пита»; стенд и тесты подставляют свой):
//   load() → сырые настройки реплик; normalize(raw) → реплики { [id]: { text, url, duration, said, custom } }; audit(raw) → { [id]: { status, reason, was, now, when } };
//   saveText(id, text) · voice(id) → { done, failed } · setFile(id, file) · restore(id, prev) — каждое пишет в настройки и бросает ошибку при отказе; copy(text) → true / false.
// Разметка рта своего файла (admin/speech/raceLineActions.js): ход («загружаю файл… → слушаю запись (Vosk)…») и итог приходят подпиской watchMouth — в busy.what и в сообщение «готово»;
//   «разметить рот заново» — api.realign(id), а у боевого api (LINE_API) — raceLineActions.realignLine; у подставного api без realign кнопки нет.
// После каждой записи настройки перечитываются — карточка, метка на клипе, список «Нужно озвучить» и звук клипа сразу показывают новое. api = null — правки на экране нет.
//   orphans(raw) → id записей озвучки удалённых реплик (нет — []); restoreVoice(id, rec) — вернуть прежний файл озвучки (нет — кнопки нет).
// → { status, lines, audit, orphans, busy ({ id, what }), error ({ id, text }), done ({ id, text }), undo ({ id, prev }), was ({ id, rec } — запись до последней правки), saveText, voice, setFile, realign, restore, restoreVoice, copy, reload }
export function createLineEdit(api, set) { // логика без React (тесты): set(patch) — обновить состояние
  const snap = { lines: null }
  const realign = api.realign ?? (api === LINE_API ? id => realignLine(id) : null)
  const mouthWatch = id => { // ход и итог разметки рта этой реплики: шаги — в busy.what, итог — для сообщения «готово»
    let res = null
    return { res: () => res, run: async fn => { const off = watchMouth(m => { if (m.id !== id) return; if (m.step) set({ busy: { id, what: String(m.step) } }); if (m.result) res = m.result }); try { await fn() } finally { off() } } }
  }
  const reload = async () => {
    try { const raw = await api.load(), lines = api.normalize(raw); snap.lines = lines; set({ status: 'ready', lines, audit: api.audit(raw), orphans: api.orphans?.(raw) ?? [], loadError: '' }) } catch (e) { set({ status: 'error', loadError: String(e?.message ?? e) }) }
  }
  const act = async (id, what, run, ok) => {
    const rec = snap.lines?.[id] ?? null // запись реплики до правки: проверка после сохранения сравнивает длину с прежней, «вернуть прежнюю озвучку» берёт её файл
    set({ busy: { id, what }, error: null, done: null })
    try { const extra = await run(); await reload(); set({ busy: null, done: { id, text: typeof ok === 'function' ? ok() : ok }, was: { id, rec }, ...(extra ?? {}) }); return true } catch (e) { set({ busy: null, error: { id, text: what === 'voice' ? `Не озвучилось: ${String(e?.message ?? e)}` : what === 'mouth' ? `Рот не размечен: ${String(e?.message ?? e)}` : saveError(e) } }); return false }
  }
  return {
    reload,
    /** Новый текст реплики — во все игры сразу (общие настройки). Пустой текст не сохраняется. Снимок прежней записи — для «вернуть прежний текст» */
    saveText: (id, text) => {
      const t = String(text ?? '').trim(), prev = snap.lines?.[id] ?? null
      if (!t) { set({ error: { id, text: 'Пустой текст не сохраняется.' } }); return Promise.resolve(false) }
      return act(id, 'text', async () => { await api.saveText(id, t); return { undo: prev ? { id, prev } : null } }, 'Текст сохранён — он изменился везде. Старая озвучка говорит прежний текст: озвучь заново или выбери файл.')
    },
    voice: id => act(id, 'voice', async () => { const r = await api.voice(id); if (r?.failed?.[id]) throw new Error(r.failed[id]); if (r && !r.done) throw new Error('реплика не озвучена (нет текста или в нём подставляется слово)') }, 'Озвучено — можно слушать.'),
    setFile: (id, file) => { const m = mouthWatch(id); return act(id, 'file', () => m.run(() => api.setFile(id, file)), () => `Файл загружен — можно слушать. ${mouthDone(m.res())}`.trim()) },
    /** «Разметить рот заново» по уже загруженному файлу; null — у этого api такой возможности нет (кнопки нет) */
    realign: realign ? id => { const m = mouthWatch(id); return act(id, 'mouth', () => m.run(() => realign(id)), () => mouthDone(m.res()) || 'Рот размечен.') } : null,
    restore: undo => act(undo.id, 'restore', async () => { await api.restore(undo.id, undo.prev); return { undo: null } }, 'Прежний текст возвращён.'),
    /** «Вернуть прежнюю озвучку» после переозвучки или своего файла (was — { id, rec }: запись до замены); null — у этого api такой возможности нет */
    restoreVoice: api.restoreVoice ? (id, rec) => act(id, 'restore', async () => { await api.restoreVoice(id, rec) }, 'Прежняя озвучка возвращена.') : null,
  }
}

export function useLineEdit(api) {
  const [st, setSt] = useState(() => ({ status: api ? 'loading' : 'off', lines: null, audit: null, orphans: [], busy: null, error: null, done: null, undo: null, was: null, loadError: '' }))
  const core = useMemo(() => (api ? createLineEdit(api, patch => setSt(s => ({ ...s, ...patch }))) : null), [api])
  useEffect(() => { core?.reload() }, [core])
  const copy = useCallback(async text => { try { return !!(await (api?.copy ?? (t => navigator.clipboard.writeText(t).then(() => true)))(String(text ?? ''))) } catch { return false } }, [api])
  return useMemo(() => (core ? { ...st, ...core, copy } : null), [core, st, copy])
}
