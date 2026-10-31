import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { getGameMic } from '../../shared/lib/gameMic.js'
import { guardStream } from '../../shared/lib/gameMicGesture.js'
import { pLog } from '../../shared/lib/debug.js'
import { releaseTake } from './mirror/takeRecorder.js'
import { noteFor } from './mirror/mirrorNotes.js'
import { makeMirrorDictor } from './rehearsalMirror.js'
import { createTake } from './rehearsalTake.js'
import { rngFor } from './rehearsalSeed.js'

// Дубль и зеркало (акт 5) в директоре актов — обёртка над createTake (rehearsalTake.js): запись на стадии take и данные экрана mirror. Вызывает useRehearsalActs.
//  • вход в стадию take → запись на потоке игры. Окон речи Пита на этой стадии нет (плашка «Дубль. Три, два, один…» — отдельная стадия до неё, а на «не успел» Пит на дубле молчит), gameMicHold дорожку не глушит;
//  • leave(stage, go) — директор зовёт его, когда стадия закончилась (вместо сразу next): для take дубль сначала дописывается (слушатель, запись, measure, note), и ТОЛЬКО потом go() → next → экран mirror.
//    Остальные стадии и игра без плана — сразу go();
//  • сбой записи → зеркало с диктором и заметкой о сбое; стадию take обошли — то же;
//  • objectURL дубля освобождается при выходе с экрана зеркала и при выходе из игры; недописанная запись отменяется.
const none = { student: null, measure: null, note: noteFor(null), tempo: null }

export function useRehearsalTake({ plan, running, at, listenerRef, rate, lang }) {
  const chunks = plan?.chunks
  const isTake = !!plan && running?.type === 'take'
  const isMirror = !!plan && running?.type === 'mirror'
  const ctl = useRef(null)          // идущий дубль (createTake)
  const takeRef = useRef(null)      // готовый дубль (objectURL освобождает releaseTake)
  const dictorRef = useRef(null)
  const alive = useRef(true)
  const [made, setMade] = useState(null)

  useEffect(() => { alive.current = true; return () => { alive.current = false; ctl.current?.cancel(); dictorRef.current?.cancel(); releaseTake(takeRef.current) } }, [])

  useEffect(() => {
    if (!isTake) return undefined
    const t = createTake({ chunks, rate, lang, rng: rngFor(plan.seed, 'mirror'), getStream: guardStream(getGameMic), log: pLog })
    ctl.current = t
    t.begin(listenerRef.current)
    return () => { t.cancel(); if (ctl.current === t) ctl.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTake, at])

  useEffect(() => {
    if (!isMirror) return undefined
    return () => { dictorRef.current?.cancel(); releaseTake(takeRef.current) }
  }, [isMirror])

  const leave = useCallback((stage, go) => {
    const t = ctl.current
    if (!plan || stage?.type !== 'take' || !t) { go(); return }
    t.finish(listenerRef.current).then(r => {
      if (!alive.current) { releaseTake(r.take); return }
      releaseTake(takeRef.current); dictorRef.current?.cancel()
      takeRef.current = r.take; dictorRef.current = r.mirror.dictor
      setMade(r.mirror)
      go()
    }, go) // что бы ни случилось, игра идёт дальше: зеркало покажет сбой записи
  }, [plan, listenerRef])

  // Экран зеркала без дубля (стадию take обошли): диктор и заметка о сбое — тоже честный экран
  const fallback = useMemo(() => (isMirror && !made ? { ...none, dictor: makeMirrorDictor({ chunks, rate, lang }) } : null), [isMirror, made, chunks, rate, lang])
  return { mirror: made ?? fallback, leave }
}
