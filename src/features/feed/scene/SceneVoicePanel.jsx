import { memo, useMemo } from 'react'
import SayStage from '../../player/panels/say-phrase/SayStage.jsx'
import SayMicPopup from '../../player/panels/say-phrase/SayMicPopup.jsx'
import { useSayAutoPopup } from '../../player/panels/say-phrase/useSayAutoPopup.js'
import { useDelayedMicState } from '../../player/panels/say-phrase/useDelayedMicState.js'
import { useHudPopupExit } from '../../../app/hudPopupState.js'
import { micLabel } from '../../../shared/lib/speech/sayMic.js'
import { micVisualState, hasMicAccess } from '../../../shared/lib/speech/sayMicState.js'
import { autoPopupWanted } from '../../../shared/lib/speech/sayAutoPopup.js'
import { taskExpectedPhrases } from './sceneVoiceData.js'
import { silenceScene } from './sceneTaskPlay.js'
import { useSceneVoice } from './useSceneVoice.js'
import SceneVoiceSheet from './SceneVoiceSheet.jsx'

// Панель голосового задания ('say' «Ответь коту» / 'repeat' «Повтори за диктором») — по аналогии с клавиатурной выезжает снизу
// (внутри SceneTaskCover). Круг-микрофон, кольцо, волны, подпись и попап разрешения — те же компоненты и хук, что в уроке «Сказать фразу»
// (SayStage / SayRing / SayMicPopup / useSayPhrase), вид круга и задержки — micVisualState + useDelayedMicState. Здесь только проводка:
// task — результат useSceneTask. Тап по микрофону сначала гасит озвучку сцены («Ещё раз» не должна попасть в запись), затем обычный
// тап «Сказать фразу». Микрофон гасится при закрытии панели (размонтирование хука), «Не могу говорить» — пропуск без штрафа.
function SceneVoicePanel({ task, apiRef, total }) {
  const { info, state: st } = task
  const sp = useSceneVoice({ info, act: task })
  const pop = useHudPopupExit(sp.phase === 'explain')
  const micTarget = micVisualState({ ...sp.access, phase: sp.phase })
  const micState = useDelayedMicState(micTarget, { settled: sp.perm.isChecked(), noAccess: !hasMicAccess(sp.access), opened: sp.view?.status === 'listening', popup: sp.phase === 'explain' })
  const visualPhase = micState === 'locked' && micTarget === 'active' ? 'idle' : sp.phase
  const mic = micLabel({ phase: visualPhase, fallbackReason: sp.fallbackReason, go: sp.go, locked: micState === 'locked' })
  useSayAutoPopup({ visible: true, phase: sp.phase, open: sp.openExplain, wanted: autoPopupWanted({ visible: true, phase: sp.phase, taps: sp.taps, micState: micTarget, decision: sp.perm.decide() }) })
  const expected = useMemo(() => taskExpectedPhrases(info.task, info.line), [info])

  const tapMic = () => { silenceScene(apiRef.current, total); sp.tapMic() }
  const stage = (
    <SayStage
      label={mic.label} mode={mic.mode} state={micState} level={sp.level}
      disabled={st.phase === 'checked' || st.phase === 'closed' || !!sp.fallbackReason} onTap={tapMic}
    />
  )
  const popup = pop.shown ? <SayMicPopup kind={sp.explainKind} closing={pop.closing} onConfirm={sp.confirmExplain} onCancel={sp.cancelExplain} /> : null
  return (
    <SceneVoiceSheet
      kind={info.task.kind} phase={st.phase} wrong={st.wrong} note={st.note} attempt={st.attempt} ok={st.ok} heard={st.heard}
      fallbackReason={sp.fallbackReason} prompt={info.prompt} lineText={info.line.text} hint={info.task.hint ?? ''} expected={expected}
      stage={stage} popup={popup}
      onReplay={task.replay} onSkip={task.voiceSkip} onLater={task.later} onFinish={task.finish}
    />
  )
}

export default memo(SceneVoicePanel)
