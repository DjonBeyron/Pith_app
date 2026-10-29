import { gameMicHold } from '../../../../shared/lib/gameMicHold.js'

// Ход ступени диктора (стадия dictor директора useWordLaneFlow): по плану planDictor включает звук каждого повтора (запись автора — финал, куски из библиотеки — по отдельности), двигает взгляд кота на границах слов
// и переключает ступень, когда план кончился. Ещё открывает «окно речи» диктора (gameMicHold): на всю ступень, а закрывает сразу после последнего повтора — слушатель ученика стартует лишь через END_TAIL_MS,
// так что дорожка микрофона (режим «глушить», pithy_game_mic_hold_v1) успевает вернуться и проверяться. Таймеры складываются в ids — директор чистит их при смене стадии; возвращается release (закрыть окно).
export const AUDIO_LATENCY_MS = 70      // звук включаем чуть раньше плана: запуск элемента и перемотка занимают время
export const MIC_BACK_AFTER_MS = 150    // дорожку возвращаем через столько после конца последнего повтора (и не позже, чем за столько до слушателя)

/** left(at) → мс до момента at от старта ступени. → release() — закрыть окно речи (идемпотентно) */
export function scheduleDictor({ plan, left, look, sayClip, sayChunk, next, ids, hold = gameMicHold }) {
  look()?.lineStart() // говорит диктор: зрачки кота оживают, на каждой пилюле — саккада (граница слова)
  for (const r of plan.reps) {
    for (const pc of r.pieces ?? []) ids.push(setTimeout(() => look()?.word(), left(pc.at)))
    if (r.mode === 'clip' && r.row) ids.push(setTimeout(() => sayClip(r.row), left(r.at - AUDIO_LATENCY_MS))) // запись автора (финал: вся фраза)
    else for (const pc of r.pieces) ids.push(setTimeout(() => sayChunk(pc.chunk), left(pc.at - AUDIO_LATENCY_MS - pc.lead))) // куски по отдельности из библиотеки (голос в файле начинается через lead после включения)
  }
  ids.push(setTimeout(next, left(plan.listenMs)))
  let held = true
  const release = () => { if (held) { held = false; hold.end() } }
  hold.begin()
  const last = plan.reps.at(-1)
  const lastEnd = last ? last.at + last.ms : plan.listenMs
  ids.push(setTimeout(release, left(Math.min(plan.listenMs - MIC_BACK_AFTER_MS, lastEnd + MIC_BACK_AFTER_MS))))
  return release
}
