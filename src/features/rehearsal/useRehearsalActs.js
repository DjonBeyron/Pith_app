import { useState, useEffect, useCallback } from 'react'
import { lineMs, LINE_PAUSE_MS } from '../player/modules/rotate-phone/wordLaneCatLines.js'
import { fillLine } from './rehearsalLines.js'
import { createJournal, record, nextRunnable, weakLanes } from './rehearsalJournal.js'
import { reportSession } from './rehearsalSim.js'
import { useRehearsalTake } from './useRehearsalTake.js'
import { demoSummary } from './polish/polishDemo.js'

// Директор «Репетиции с Питом» поверх useWordLaneFlow: всё, что сценарию актов нужно сверх обычной игры, — в одном хуке; директору остаются точки подключения (его next / стадии / реакции движка).
//  • журнал актов (rec ← реакции движка win / miss / fail): по нему решаются повтор ступени сборки, сокращение акта 4 и пропуск «Различи» (nextIdx), подпись слабого слова в «без текста» (hintLanes), итог (reportSession);
//  • реплики Пита: на старте стадии (stage.line, через busyLeft — ждёт, пока Пит договорит прошлую), «это слово и будем тренировать» на первом промахе разминки; holdMs — плашка акта держится, пока Пит говорит;
//  • подсветка куска в читке (hl: таймеры по stage.metro), «застрял 3 с» в акте «без текста» (слушатель молчит STUCK_MS — Пит подсказывает первое слово, подпись куска на HINT_LABEL_MS);
//  • дубль и зеркало (акт 5): запись на стадии take и данные экрана mirror (темп, заметка Пита) — useRehearsalTake; на стадии mirror Пит говорит rh_mirror (stage.line);
//  • итог на экране summary: симуляция памяти и XP (rehearsalSim.js) — один раз, в память сессии и журнал отладки; темп и заметка зеркала идут туда же.
// Без плана (обычная нода игры) хук ничего не делает: nextIdx / holdMs возвращают то же, что директор взял бы сам.
export const LINE_AT_MS = 250       // реплика на старте стадии — чуть позже появления плашки
export const STUCK_MS = 3000        // слушатель молчит столько — «застрял»
export const HINT_LABEL_MS = 2000   // подпись куска-подсказки
export const MAX_STUCK_HINTS = 2    // подсказок на ступень

export function useRehearsalActs({ plan, stages, stage, at, stageObj, setS, sayLine, sayText, cat, lines, rate, lang, listenerRef }) {
  const [journal] = useState(createJournal)
  const [hl, setHl] = useState(-1)
  const [result, setResult] = useState(null)
  const on = !!plan
  const running = on && stage === 'run' ? stageObj : null
  const take = useRehearsalTake({ plan, running, at, listenerRef, rate, lang })
  const nextIdx = useCallback(i => (on ? nextRunnable(stages, i, journal) : i), [on, stages, journal]) // стабильна: на ней держится next директора

  // Вступление: Пит говорит про фразу, пока она падает
  useEffect(() => {
    if (!on || stage !== 'drop') return undefined
    const t = setTimeout(() => sayLine('rh_start'), LINE_AT_MS)
    return () => clearTimeout(t)
  }, [on, stage, sayLine])

  // Реплика стадии: ждём, пока Пит договорит прошлую
  useEffect(() => {
    if (!running?.line) return undefined
    const t = setTimeout(() => sayLine(running.line), LINE_AT_MS + cat.busyLeft() + 20)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, at])

  // Подсветка кусков по времени (читка и повтор ученика)
  useEffect(() => {
    const metro = running?.metro
    if (!metro?.length) return undefined
    const left = t => Math.max(0, t - (performance.now() - at))
    const ids = metro.map(m => setTimeout(() => setHl(m.chunk), left(m.at)))
    const last = metro.at(-1)
    ids.push(setTimeout(() => setHl(-1), left(last.at + last.ms)))
    return () => { ids.forEach(clearTimeout); setHl(-1) }
  }, [running, at])

  // «Без текста»: слушатель молчит 3 с — Пит подсказывает первое слово, подпись куска на 2 с
  useEffect(() => {
    if (running?.act !== 'blind' || !running.hintWord) return undefined
    let last = Date.now(), shown = 0, labelTimer = 0
    const id = setInterval(() => {
      last = Math.max(last, listenerRef.current?.heardAt?.() ?? 0)
      if (shown >= MAX_STUCK_HINTS || Date.now() - last < STUCK_MS || cat.busyLeft() > 0) return
      shown += 1; last = Date.now()
      sayLine('rh_blind_hint', { word: running.hintWord })
      sayText(running.hintWord)
      setS(p => ({ ...p, hint: [running.hintLane ?? 0] }))
      clearTimeout(labelTimer)
      labelTimer = setTimeout(() => setS(p => ({ ...p, hint: [] })), HINT_LABEL_MS)
    }, 400)
    return () => { clearInterval(id); clearTimeout(labelTimer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, at])

  // Итог: симуляция памяти и XP — один раз на выходе на экран summary
  useEffect(() => {
    if (running?.type !== 'summary') return undefined
    const t = setTimeout(() => { setResult(plan.only === 'summary' ? reportSession({ plan, ...demoSummary(plan) }) : reportSession({ plan, journal, mirror: take.mirror })); sayLine('rh_done') }, 0) // «Шлифовка → Итог»: результат подставной (polish/polishDemo.js)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  return {
    on, hl, result, journal,
    /** Экран зеркала: { dictor, student, measure, note, tempo } (записи нет — student и measure null) */
    mirror: take.mirror,
    /** Стадия закончилась: дубль сначала дописывается (запись, слова), потом go(); остальные стадии — сразу go() */
    leave: take.leave,
    tag: running?.tag ?? '',
    /** Реакция движка на ступени: 'win' | 'miss' | 'fail' → журнал; первый промах разминки — реплика Пита */
    rec(kind) {
      if (!running) return
      const had = (journal.stages[running.sid]?.miss ?? 0) + (journal.stages[running.sid]?.fail ?? 0)
      record(journal, running, kind)
      if (kind === 'miss' && !had && (running.act === 'warmup' || running.act === 'word')) sayLine('rh_warmup_miss')
    },
    /** Реплика на «не успел»: в разминке — «это слово и будем тренировать»; иначе null (обычные реплики игры) */
    failLine: st => (st?.act === 'warmup' || st?.act === 'word' ? 'rh_warmup_miss' : null),
    /** Следующая стадия, на которую идём: пропущенные по правилам (cond) обходятся */
    nextIdx,
    /** Сколько держать плашку (announce / turn): пока Пит договорит прошлую реплику и скажет свою */
    holdMs: st => {
      if (!on || !st?.line) return st.ms
      return Math.max(st.ms, LINE_AT_MS + cat.busyLeft() + lineMs(fillLine(lines?.[st.line]), rate) + LINE_PAUSE_MS)
    },
    /** Дорожки со слабыми словами разминки: в «без текста» у них видна подпись */
    hintLanes: st => (on && st?.act === 'blind' && st.type === 'student' ? weakLanes(journal, stages) : []),
  }
}
