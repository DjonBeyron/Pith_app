import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClipPlayer, IDLE } from './clipPlayer.js'
import { voiceOf, voiceKey } from './timelineVoice.js'

// Звук клипов экрана «Таймлайн игры»: нажатие на клип речи проигрывает его озвучку (CONCEPT_TIMELINE.md, «Звук клипа»). Один проигрыватель на экран (clipPlayer.js — обычный <audio>, не игровой звук);
// озвучка загружается ОДИН раз при открытии экрана: voices.load() → { lines (реплики Пита и Мии из настроек), lib (библиотека слов — диктор) } — боевой загрузчик в TimelineOpenButton, стенд и тесты подставляют свой.
// voices = null — звука на экране нет (кнопки ▶ не рисуются). Esc и закрытие экрана останавливают звук.
// → { state (clipPlayer: key, status, dur, error), toggle(реплика), stop(), of(реплика) → timelineVoice.voiceOf, key(реплика) }
export function useClipAudio(voices, make) {
  const [src, setSrc] = useState(() => (voices ? { status: 'loading', lines: null, lib: null } : null))
  const [state, setState] = useState(IDLE)
  const [player] = useState(() => createClipPlayer({ onState: setState, ...(make ? { make } : {}) }))

  useEffect(() => {
    if (!voices) return undefined
    let live = true
    Promise.resolve().then(() => voices.load()).then(
      r => { if (live) setSrc({ status: 'ready', lines: r?.lines ?? {}, lib: r?.lib ?? null }) },
      e => { if (live) setSrc({ status: 'error', lines: null, lib: null, error: String(e?.message ?? e) }) },
    )
    return () => { live = false }
  }, [voices])
  useEffect(() => () => { player.stop() }, [player])
  useEffect(() => {
    if (state.status !== 'playing' && state.status !== 'loading') return undefined
    const on = e => { if (e.key === 'Escape') player.stop() }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [state.status, player])

  const toggle = useCallback(line => {
    const key = voiceKey(line), v = voiceOf(line, src)
    if (!v.url) { player.stop(); setState({ key, status: 'none', error: v.why }); return }
    player.toggle(key, v.url)
  }, [src, player])
  const stop = useCallback(() => { player.stop(); setState(s => (s.status === 'idle' ? s : IDLE)) }, [player])
  const of = useCallback(line => voiceOf(line, src), [src])
  return useMemo(() => (voices ? { state, toggle, stop, of, key: voiceKey } : null), [voices, state, toggle, stop, of])
}
