import { useCallback, useEffect, useMemo, useState } from 'react'
import { saveError } from './timelineLineEdit.js'

// Правка реплики Пита / Мии прямо из карточки «Таймлайна игры» (CONCEPT_TIMELINE.md, «Правка реплики из карточки»): текст, переозвучка, свой файл, «вернуть прежний текст».
// Сам хук ничего не знает о настройках: всё делает api (боевой — timelineLineApi.js, ТЕ ЖЕ функции, что у таблицы «Озвучка Пита»; стенд и тесты подставляют свой):
//   load() → сырые настройки реплик; normalize(raw) → реплики { [id]: { text, url, duration, said, custom } }; audit(raw) → { [id]: { status, reason, was, now, when } };
//   saveText(id, text) · voice(id) → { done, failed } · setFile(id, file) · restore(id, prev) — каждое пишет в настройки и бросает ошибку при отказе; copy(text) → true / false.
// После каждой записи настройки перечитываются — карточка, метка на клипе, список «Нужно озвучить» и звук клипа сразу показывают новое. api = null — правки на экране нет.
// → { status, lines, audit, busy ({ id, what }), error ({ id, text }), done ({ id, text }), undo ({ id, prev }), saveText, voice, setFile, restore, copy, reload }
export function createLineEdit(api, set) { // логика без React (тесты): set(patch) — обновить состояние
  const snap = { lines: null }
  const reload = async () => {
    try { const raw = await api.load(), lines = api.normalize(raw); snap.lines = lines; set({ status: 'ready', lines, audit: api.audit(raw), loadError: '' }) } catch (e) { set({ status: 'error', loadError: String(e?.message ?? e) }) }
  }
  const act = async (id, what, run, ok) => {
    set({ busy: { id, what }, error: null, done: null })
    try { const extra = await run(); await reload(); set({ busy: null, done: { id, text: ok }, ...(extra ?? {}) }); return true } catch (e) { set({ busy: null, error: { id, text: what === 'voice' ? `Не озвучилось: ${String(e?.message ?? e)}` : saveError(e) } }); return false }
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
    setFile: (id, file) => act(id, 'file', async () => { await api.setFile(id, file) }, 'Файл загружен — можно слушать.'),
    restore: undo => act(undo.id, 'restore', async () => { await api.restore(undo.id, undo.prev); return { undo: null } }, 'Прежний текст возвращён.'),
  }
}

export function useLineEdit(api) {
  const [st, setSt] = useState(() => ({ status: api ? 'loading' : 'off', lines: null, audit: null, busy: null, error: null, done: null, undo: null, loadError: '' }))
  const core = useMemo(() => (api ? createLineEdit(api, patch => setSt(s => ({ ...s, ...patch }))) : null), [api])
  useEffect(() => { core?.reload() }, [core])
  const copy = useCallback(async text => { try { return !!(await (api?.copy ?? (t => navigator.clipboard.writeText(t).then(() => true)))(String(text ?? ''))) } catch { return false } }, [api])
  return useMemo(() => (core ? { ...st, ...core, copy } : null), [core, st, copy])
}
