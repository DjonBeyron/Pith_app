import { useEffect, useRef } from 'react'
import { usePromptSlotContext } from '../../../shared/lib/prompts/usePromptSlotContext.js'
import { onTrack } from '../../../shared/lib/analytics/track.js'
import { createHintJudge } from './behaviorHints.js'
import { createHintRunner } from './hintRunner.js'

// Подсказки ленты по поведению (звук, замедление, «потри», «тапни слово»; PLAN_NEW_USER.md → B2). Хук только подключает
// провода: правила — behaviorHints.js, просьба к бюджету Пита и ответы — hintRunner.js; подсказку рисует шторка PromptSheet.
// Вне хоста бюджета (тесты, превью) ничего не показывает.
//   activeIdx  — индекс активного слайда (< 0 — ленты на экране нет, отсчёты стоят)
//   soundReady — звук ленты реально включён
//   enableSound — включить звук (handleSoundOn из useFeedSound): зовётся по ответу «Послушаем?» прямо в жесте тапа
export function useBehaviorHints(activeIdx, soundReady, enableSound) {
  const slot = usePromptSlotContext()
  const live = useRef({ slot, enableSound })
  useEffect(() => { live.current = { slot, enableSound } })
  const runnerRef = useRef(null)

  // Объявлены по порядку: сначала создаётся ранер, потом ему сообщают о звуке и слайде
  useEffect(() => {
    const runner = createHintRunner({
      judge: createHintJudge(),
      getSlot: () => live.current.slot,
      enableSound: () => live.current.enableSound?.(),
      subscribe: onTrack,
    })
    runnerRef.current = runner
    const stop = runner.start()
    return () => { stop(); runnerRef.current = null }
  }, [])
  useEffect(() => { runnerRef.current?.setSound(!!soundReady) }, [soundReady])
  useEffect(() => { runnerRef.current?.onSlide(activeIdx) }, [activeIdx])
}
