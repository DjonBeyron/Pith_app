import { useCallback, useEffect, useRef, useState } from 'react'
import { pLog } from '../../../../shared/lib/debug.js'
import { usePlayerFrozen } from '../../playerFrozen.js'
import { useLessonMuted, useVoiceRate } from '../../lessonVolume.js'
import { unlockSceneAudio } from '../../../scene/v2/sceneAudioUnlock.js'
import { useSceneSolo } from './useSceneSolo.js'

// Поведение живой сцены в ленте урока (общее для пузыря и кружка):
//  · автозапуск после появления (не история, не предрисовка за экраном —
//    ждём снятия pending и ~220 мс анимации въезда, как у видео);
//  · заморозка шагового режима админа → paused у рендерера (режиссёр сам
//    вернётся к игре, когда отпустят);
//  · «без звука»/скорость голоса из шапки урока (lessonVolume.js);
//  · тап = пауза/пуск (после конца — заново); звук открывается из жеста
//    (sceneAudioUnlock.js);
//  · одна медиа-нода звучит разом (useSceneSolo.js);
//  · doиграла последняя реплика → onDone('played') ровно один раз.
// Состояние React меняется только на границах реплик (onState рендерера).

const APPEAR_MS = 220

export function useScenePlayback({ autoplay, pending, onDone }) {
  const apiRef = useRef(null)
  const rootRef = useRef(null)
  const doneRef = useRef(false)
  const startedRef = useRef(false)
  const [st, setSt] = useState({ status: 'idle', index: 0, total: 0 })
  const frozen = usePlayerFrozen()
  const muted = useLessonMuted()
  const rate = useVoiceRate()

  const onState = useCallback(next => {
    setSt(prev => (prev.status === next.status && prev.index === next.index && prev.total === next.total ? prev : next))
  }, [])

  // Конец сцены → переход по графу (один раз)
  useEffect(() => {
    if (st.status !== 'ended' || doneRef.current) return
    doneRef.current = true
    pLog('[scene] доиграла → onDone(played)')
    onDone?.('played')
  }, [st.status, onDone])

  // Автозапуск, когда нода реально показана
  useEffect(() => {
    if (!autoplay || pending || startedRef.current) return undefined
    const t = setTimeout(() => {
      if (startedRef.current) return
      startedRef.current = true
      apiRef.current?.play()
    }, APPEAR_MS)
    return () => clearTimeout(t)
  }, [autoplay, pending])

  const pause = useCallback(() => apiRef.current?.pause(), [])
  useSceneSolo(rootRef, st.status === 'playing', pause)

  const handleTap = useCallback(e => {
    e?.stopPropagation?.()
    unlockSceneAudio()
    startedRef.current = true
    const api = apiRef.current
    if (!api) return
    if (st.status === 'ended') api.restart()
    else api.toggle()
  }, [st.status])

  return {
    apiRef, rootRef, onState, handleTap, state: st,
    paused: frozen, sound: !muted, rate,
    playing: st.status === 'playing',
  }
}
