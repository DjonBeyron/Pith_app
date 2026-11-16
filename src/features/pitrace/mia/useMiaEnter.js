import { useEffect } from 'react'
import { reduceMia, applyMia, markMiaEntered } from './raceMia.js'
import { miaOn } from './miaConfig.js'

// Вход на стадию для эпизода «Мия» (директор гонки, useRaceActs): реплики церемонии и конца (mia_end / pit_end) встают в очередь речи СРАЗУ, в эффекте входа, который стоит в хуке РАНЬШЕ
// директора репетиции: его расчёт времени стадии (реплика Пита, три ноты) видит очередь Мии (mspeech.leftMs) и ждёт её конца — раньше очередь появлялась по таймеру 0 уже ПОСЛЕ расчёта, и
// реплика следующего этапа («задание») отказывала: Пит ещё занят «Ничего, эти слова мы ещё встретим». Состояние для экрана (setMiaView) — по таймеру 0 (setState в эффекте нельзя).
export function useMiaEnter({ running, at, mb, mspeech, setMiaView, log }) {
  useEffect(() => {
    if (!running || !miaOn() || !markMiaEntered(mb, `${running.idx}:${at}`)) return undefined
    if (running.mia === 'ann' && mb.m.phase === 'in' && mb.m.act === running.act) mspeech.stop() // повторный вход (пауза, перезапуск ступени): прежняя очередь и пример сняты, церемония пойдёт заново
    const dropAt = running.mia === 'ann' && running.dropAt == null && running.line ? 300 + mspeech.msOf(running.line, 'pit') : undefined // коробка падает, когда Пит договорил реплику стадии («некоторые слова забылись…»), а не посреди неё
    const r = reduceMia(mb.m, { t: 'enter', stage: running, now: performance.now(), dropAt })
    if (r.mia === mb.m && !r.say.length && r.boost == null) return undefined
    if (r.mia.phase !== mb.m.phase) log(`[mia] ${r.mia.phase === 'in' ? `Мия пришла (${r.mia.act}), коробка падает через ${Math.round(r.mia.at - performance.now())} мс` : r.mia.phase === 'out' ? `Мия уходит: ${r.mia.why === 'win' ? 'три верных подряд' : 'круг кончился'}` : `Мия: ${r.mia.phase}`}`)
    if (r.log) log(`[mia] ${r.log}`)
    const view = applyMia(mb, r, running)
    if (r.say.length) mspeech.enqueue(r.say)
    const t = setTimeout(() => setMiaView(view), 0)
    return () => clearTimeout(t)
  }, [running, at, mb, mspeech, setMiaView, log])
}
