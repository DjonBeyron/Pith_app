// «Продолжить»: вывод мёртв после всех повторов renew (gameAudioRenewLive.js) — не сдаёмся молча (v3.3.165). Журнал владельца (iPhone iOS 18.7): свернул игру, надиктовал текст голосом в Telegram,
// вернулся — контекст running, а пробный звук не доигрывает трижды: аудиосессию держала чужая запись (диктовка), а getUserMedia в этом цикле даже не вызывался (дорожка ended, жёлтой точки нет).
//  (а) микрофон в этом тапе ещё не открывали — открываем (живую дорожку включаем; оборванную — getUserMedia, если жест ещё жив): на iOS захват микрофона сам активирует сессию и часто
//      «отбирает» её у фоновой записи; потом renew (тип play-and-record) без повторов и проба. Живой — продолжаем обычный старт;
//  (б) проба в типе 'auto' (renew с wantType 'auto'): живой при мёртвом play-and-record — микрофон занят другим приложением; мёртв и там — вывод держит другое приложение (звонок, запись).
// Итог (б) — busy (строка для журнала): попап паузы показывает SOUND_BUSY_TEXT и повторяет попытку сам (useWordLanePause). Зависимости — те же d, что у restartGameAudio.
import { probeLive } from './gameAudioRenewLive.js'

/** Зависимости renewUntilLive из набора restartGameAudio */
export const liveDeps = d => ({ renew: d.renew, probe: d.probe, peekCtx: d.peekCtx, log: d.log, active: d.active, session: d.session })

/** → { ok, probe, tries, micOpened?, busy?, autoAlive? } (не отклоняется). o: { micOpened, renewOpts, step(name, extra), liveLine(line) } */
export async function deadOutputFallback(d, { micOpened = false, renewOpts = {}, step = () => {}, liveLine = () => false } = {}) {
  let opened = false
  if (!micOpened && (liveLine(d.micLine()) || d.active())) {
    step('dead-mic-first', `вывод мёртв — сначала захват микрофона (дорожки ${d.micLine()}), потом тип play-and-record и проба`)
    let mr
    try { mr = await d.openMic() } catch { mr = 'unavailable' }
    if (mr === 'granted') {
      opened = true
      let lv
      try { lv = await d.renewLive({ ...renewOpts, reason: `${renewOpts.reason ?? 'старт'}, после захвата микрофона`, maxRetries: 0 }, liveDeps(d)) } catch { lv = null }
      step('probe-after-mic', lv?.ok ? `вывод ожил после захвата микрофона, пробный звук ${lv.probe?.ms ?? '—'} мс` : `всё ещё мёртв: ${lv?.probe?.why ?? '—'}; audioSession=${d.session()}`)
      if (lv?.ok) return { ...lv, micOpened: true }
    } else step('dead-mic-first', `микрофон не открылся (${mr})`)
  }
  try { await d.renew({ reason: 'проба вывода в типе auto', wantType: 'auto', applyType: null }) } catch { /* проба ниже покажет */ }
  const pr = await probeLive(d)
  const busy = pr.ok ? 'в типе auto вывод живой, в play-and-record мёртв — микрофон занят другим приложением' : 'вывод мёртв и в типе auto — звук держит другое приложение (звонок, запись)'
  step('probe-auto', `${busy}; audioSession=${d.session()}`)
  return { ok: false, probe: pr, tries: 0, busy, autoAlive: pr.ok, micOpened: opened }
}
