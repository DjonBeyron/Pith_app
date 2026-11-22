import { useCallback, useEffect, useState } from 'react'
import { noteServerCount } from './timelineServerNote.js'

// Серверная часть экрана «Таймлайн игры»: сохранённые прохождения читаются ОДИН раз при открытии экрана и по кнопке «↻ Обновить с сервера»; «☁ Сохранить на сервер» дописывает выбранное прохождение.
// server — { read(): Promise<{ runs, error }>, save(run): Promise<{ ok, error, bytes, count }> } (боевой — shared/api/timelineApi.js; стенд и тесты подставляют свой); null — сервера нет (кнопок нет).
// state: { status: 'off' | 'loading' | 'ready' | 'error', runs, error }; ошибка сети не мешает экрану — он работает на прохождениях этого устройства. initial — начальное состояние (тесты разметки).
const text = e => String(e?.message ?? e ?? 'неизвестная ошибка')

export function useTimelineServer(server, initial = null) {
  const [state, setState] = useState(() => initial ?? { status: server ? 'loading' : 'off', runs: [], error: '' })
  const [saved, setSaved] = useState('') // '' | 'busy' | итог сохранения текстом
  const fetchNow = useCallback(() => Promise.resolve().then(() => server.read()).then(
    r => { if (!r?.error) noteServerCount(r?.runs?.length ?? 0); setState({ status: r?.error ? 'error' : 'ready', runs: r?.runs ?? [], error: r?.error ?? '' }) }, // число игр на сервере запоминается для строки статуса в админке (без лишних запросов)
    e => setState(s => ({ ...s, status: 'error', error: text(e) })),
  ), [server])
  useEffect(() => { if (server && !initial) fetchNow() }, [server, initial, fetchNow]) // состояние уже 'loading' — здесь только запрос
  const reload = useCallback(() => { if (!server) return; setState(s => ({ ...s, status: 'loading', error: '' })); fetchNow() }, [server, fetchNow])
  const save = useCallback(run => {
    if (!server || !run) return
    setSaved('busy')
    Promise.resolve().then(() => server.save(run)).then(
      r => { setSaved(r?.ok ? `✓ Сохранено на сервер${r.bytes ? ` — строка ${Math.round(r.bytes / 1024)} КБ, прохождений ${r.count}` : ''}` : `✗ Не сохранилось: ${r?.error ?? 'нет ответа'}`); if (r?.ok) fetchNow() },
      e => setSaved(`✗ Не сохранилось: ${text(e)}`),
    )
  }, [server, fetchNow])
  return { state, saved, reload, save }
}
