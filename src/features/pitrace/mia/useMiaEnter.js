import { useEffect } from 'react'
import { reduceMia, applyMia, markMiaEntered, holdEnd, clearEndTimer, bossShift, BOSS } from './raceMia.js'
import { miaOn } from './miaConfig.js'
import { pauseMs } from '../../../shared/lib/scenePauses.js'
import { afterSpeech } from '../boss/examEndWait.js'
import { ceremonyTimes } from '../boss/bossMia.js'

// Вход на стадию для эпизода «Мия» (директор гонки, useRaceActs): реплики церемонии и конца (mia_end / pit_end) встают в очередь речи СРАЗУ, в эффекте входа, который стоит в хуке РАНЬШЕ
// директора репетиции: его расчёт времени стадии (реплика Пита, три ноты) видит очередь Мии (mspeech.leftMs) и ждёт её конца — раньше очередь появлялась по таймеру 0 уже ПОСЛЕ расчёта, и
// реплика следующего этапа («задание») отказывала: Пит ещё занят «Ничего, эти слова мы ещё встретим». Состояние для экрана (setMiaView) — по таймеру 0 (setState в эффекте нельзя).
export const END_WAIT_MAX_MS = 7000 // финал: Мия договаривает последнюю колкость — конец (коробка, Мия, реплики) ждёт не дольше этого
export const END_WAIT_PAD_MS = 450

export function useMiaEnter({ running, at, mb, mspeech, setMiaView, log }) {
  useEffect(() => () => clearEndTimer(mb), [mb]) // отложенный конец финала снимается при уходе из игры
  useEffect(() => {
    if (!running || !miaOn() || !markMiaEntered(mb, `${running.idx}:${at}`)) return undefined
    if (running.mia === 'ann' && mb.m.phase === 'in' && mb.m.act === running.act) mspeech.stop() // повторный вход (пауза, перезапуск ступени): прежняя очередь и пример сняты, церемония пойдёт заново
    const dropAt = running.mia === 'ann' && running.dropAt == null && running.line ? 300 + mspeech.msOf(running.line, 'pit') : undefined // коробка падает, когда Пит договорил реплику стадии («некоторые слова забылись…»), а не посреди неё
    const boss = running.mia === 'ann' && running.script === 'boss' // финал: Пит говорит сразу, а коробка достигает его ушей к концу его реплики (владелец v3.3.272: «перед финалом Пит долго молчит»)
    const bossDrop = boss ? BOSS.DROP_AT : undefined // коробка падает сразу, Пит говорит уже в ней (v3.3.280; раньше — к концу его реплики)
    const pitMs = boss ? mspeech.msOf(Object.keys(mb.m.used ?? {}).some(k => k !== 'boss') ? 'boss_pit_1' : 'boss_pit_new', 'pit') : 0
    const shift = boss ? bossShift(pitMs) : 0 // Мия начинает вскоре после реплики Пита, а не по фиксированной метке (тишина)
    const times = boss ? ceremonyTimes({ hushAt: Math.max(BOSS.HUSH_AT + shift, pauseMs('boss.pit1At') + pitMs + BOSS.AFTER_PIT_MS), jumpAbs: BOSS.JUMP_ABS + shift, lookAt: BOSS.LOOK_AT + shift }, mspeech.msOf('boss_mia_hush')) : null // экзамен: прыжок Мии и объяснение шкалы — от реального конца её реплики из-за края
    const go = () => {
      const r = reduceMia(mb.m, { t: 'enter', stage: running, now: performance.now(), keepMs: running.mia === 'end' ? mspeech.msOf('boss_mia_keep') + 450 : undefined, dropAt: bossDrop ?? dropAt, jumpAt: boss ? Math.max(1, (times.jumpAbs - bossDrop) / 1000) : undefined, bossShift: shift, bossLookAt: times?.lookAt })
      if (r.mia === mb.m && !r.say.length && r.boost == null) return
      if (r.mia.phase !== mb.m.phase) log(`[mia] ${r.mia.phase === 'in' ? `Мия пришла (${r.mia.act}), коробка падает через ${Math.round(r.mia.at - performance.now())} мс` : r.mia.phase === 'out' ? `Мия уходит: ${r.mia.why === 'win' ? 'три верных подряд' : 'круг кончился'}` : `Мия: ${r.mia.phase}`}`)
      if (r.log) log(`[mia] ${r.log}`)
      const view = applyMia(mb, r, running)
      if (r.say.length) mspeech.enqueue(r.say)
      setTimeout(() => setMiaView(view), 0)
    }
    // Конец финала (владелец, v3.3.290): пока Мия договаривает последнюю колкость (она идёт с задержкой после ошибки на последнем слове), коробку, Мию и конечный диалог не трогаем — ждём конец её речи
    if (running.mia === 'end' && running.act === 'boss') { afterSpeech(mb, () => mspeech.pending(), go); return undefined } // экзамен: реплики исхода — когда очередь речи РЕАЛЬНО опустела (колкость о последнем слове договорена), а не через расчётное время (boss/examEndWait.js)
    const wait = running.mia === 'end' ? Math.min(END_WAIT_MAX_MS, mspeech.idleIn()) : 0
    if (wait > 150) { const pre = wait + END_WAIT_PAD_MS; holdEnd(mb, running, pre, go); log(`[mia] финал: Мия ещё говорит, конец (коробка, уход, диалог) через ${Math.round(pre)} мс`); return undefined }
    go()
    return undefined
  }, [running, at, mb, mspeech, setMiaView, log])
}

