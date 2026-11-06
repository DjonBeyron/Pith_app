import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { lineMs, LINE_PAUSE_MS } from '../player/modules/rotate-phone/wordLaneCatLines.js'
import { fillLine, pickLine, sessionLine } from './rehearsalLines.js'
import { rngFor } from './rehearsalSeed.js'
import { buildActs } from './rehearsalRecipe.js'
import { sessionLogLine } from './rehearsalVariety.js'
import { pLog } from '../../shared/lib/debug.js'
import { createJournal, record, nextRunnable, weakLanes } from './rehearsalJournal.js'
import { reportSession } from './rehearsalSim.js'
import { useRehearsalTake } from './useRehearsalTake.js'
import { hasIntroLine } from './rehearsalPrepare.js'
import { RACE_START_LEAD_MS } from '../pitrace/raceStartTrace.js'
import { earlyStageLine } from '../pitrace/raceOpening.js'
import { raceStartId } from '../pitrace/raceTexts.js'
import { stuckHint, hintEntry, sayWordHint } from './rehearsalHints.js'
import { demoSummary } from './polish/polishDemo.js'
import { stageTiming, countdownPlan } from './rehearsalCountdown.js'
import { warmCountdown, releaseCountdown } from './rehearsalCountdownSound.js'
import { createCountGate, scheduleStageCount } from './rehearsalCountdownRun.js'
import { lineVoiced } from './rehearsalQuiet.js'
import { usePitQuiet } from './usePitQuiet.js'
import { plateCueMs } from './rehearsalConveyorCue.js'
import { useCompareScene } from './mirror/useCompareScene.js'

// Директор «Репетиции с Питом» поверх useWordLaneFlow: всё, что сценарию актов нужно сверх обычной игры, — в одном хуке; директору остаются точки подключения (его next / стадии / реакции движка).
//  • журнал актов (rec ← реакции движка win / miss / fail): по нему решаются повтор ступени сборки, сокращение акта 4 и пропуск «Различи» (nextIdx), подпись слабого слова в «без текста» (hintLanes), итог (reportSession);
//  • реплики Пита: на старте стадии (stage.line, через busyLeft — ждёт, пока Пит договорит прошлую), «это слово и будем тренировать» на первом промахе разминки; holdMs — плашка акта держится, пока Пит говорит;
//  • отсчёт тремя нотами (stage.count, rehearsalCountdown.js): 'after' — после реплики стадии (разминка), 'before' — до реплики (дубль: «Дубль» → ноты → «поехали»); holdMs учитывает его длину, а afterCount не отпускает стадию, пока отсчёт не доиграл (rehearsalCountdownRun.js);
//  • тишина экрана (rehearsalQuiet.js, usePitQuiet.js): пока Пит говорит озвученную реплику на старте стадии, rh.quiet — плашка, подписи, перевод и экраны скрыты, видны только дорожки и кот; rh.plateOk — плашка может быть на экране;
//  • вступление и итог — по номеру запуска в тапе (plan.run, rehearsalLines.sessionLine): первый — rh_start / rh_done, «Ещё минутку?» — rh_start_b / rh_done_b;
//  • «застрял 3 с» в акте «без текста» (слушатель молчит STUCK_MS — Пит подсказывает первое слово, подпись куска на HINT_LABEL_MS);
//  • дубль и зеркало (акт 5): запись на стадии take и данные сравнения mirror (темп, заметка Пита) — useRehearsalTake; на стадии mirror Пит говорит rh_mirror (stage.line), потом на остановленных дорожках появляется сравнение (compare);
//  • итог на экране summary: симуляция памяти и XP (rehearsalSim.js) — один раз, в память сессии и журнал отладки; темп и заметка зеркала идут туда же.
// Без плана (обычная нода игры) хук ничего не делает: nextIdx / holdMs возвращают то же, что директор взял бы сам.
export const LINE_AT_MS = 250       // реплика на старте стадии — чуть позже появления плашки
export const STUCK_MS = 3000        // слушатель молчит столько — «застрял»
export const HINT_LABEL_MS = 2000   // подпись куска-подсказки
export const MAX_STUCK_HINTS = 2    // подсказок на ступень

export function useRehearsalActs({ plan, stages, stage, at, stageObj, setS, sayLine, sayText, cat, lines, rate, lang, listenerRef, hold = false }) {
  const [journal] = useState(createJournal)
  const [result, setResult] = useState(null)
  const on = !!plan
  const race = plan?.game === 'race' // «Гонка с Питом» (features/pitrace) — свои акты и итог на том же директоре: вступление race_start, итог и журнал ведёт useRaceActs
  const running = on && stage === 'run' ? stageObj : null
  const take = useRehearsalTake({ plan, running, at, listenerRef, rate, lang })
  const nextIdx = useCallback(i => (on ? nextRunnable(stages, i, journal) : i), [on, stages, journal]) // стабильна: на ней держится next директора

  const intro = on && hasIntroLine(plan)
  const early = on && !intro ? earlyStageLine(plan, stages) : null // «Гонка» без вступления (раунд, «Пинг-понг + финал»): реплика первой стадии звучит СРАЗУ со стартом часов, как race_start, — а не после падения фразы и дорожек (≈ 2,1 с тишины)
  const lineOf = st => (early && st?.idx === 0 ? null : st?.line ?? null) // у первой стадии её реплика уже сказана на старте: стадия только ждёт, пока Пит договорит (busyLeft), и ведёт ноты
  // Случайность внутри актов (CONCEPT_REHEARSAL.md §8): семя плана — одна сессия воспроизводима; что выбрано, пишется в журнал отладки один раз на запуск
  useEffect(() => {
    if (plan && !race) pLog(sessionLogLine(plan, buildActs(plan, { only: null }).acts))
  }, [plan, race])
  const startLine = useMemo(() => (plan ? sessionLine(plan, race ? raceStartId() : 'rh_start') : null), [plan, race]) // вариант реплики вступления и итога — на всю сессию (rehearsalLines.js)
  const doneLine = useMemo(() => (plan ? sessionLine(plan, race ? 'race_done' : 'rh_done') : null), [plan, race])
  const missRef = useRef(null) // реплика «над этим словом ещё поработаем» — несколько раз за сессию: свой поток от семени, повтор подряд запрещён
  const missLine = () => { missRef.current ??= { rng: rngFor(plan.seed, 'line:rh_warmup_miss'), last: {} }; return pickLine('rh_warmup_miss', missRef.current.rng, missRef.current.last) }
  // Вступление: Пит говорит про фразу, пока она падает (при запуске одного этапа «Шлифовки» его нет — rehearsalPrepare.hasIntroLine)
  useEffect(() => {
    if (!on || stage !== 'drop' || !(intro || early) || hold) return undefined // hold («Гонка»): звук ещё готовится, часы игры стоят — вступление ждёт
    const t = setTimeout(() => sayLine(intro ? startLine : early, null, race ? { noRise: true, ...(intro && stages[0]?.line ? {} : { pause: stages[0]?.pause ?? LINE_PAUSE_MS }) } : undefined), race ? RACE_START_LEAD_MS : LINE_AT_MS) // «Гонка»: стартовая фраза режима (или реплика первой стадии) сразу и без ожидания головы; у стадии 0 нет своей реплики — пауза стадии идёт после фразы
    return () => clearTimeout(t)
  }, [on, stage, intro, early, sayLine, startLine, hold, race]) // eslint-disable-line react-hooks/exhaustive-deps -- stages[0].pause читается в момент старта

  // Раскладка стадии по времени: реплика Пита (ждёт, пока он договорит прошлую) и отсчёт тремя нотами (stage.count) — rehearsalCountdown.stageTiming
  const timingOf = st => { const ln = lineOf(st); return stageTiming({ order: st.count ?? null, lead: LINE_AT_MS, busyMs: cat.busyLeft(), lineMs: ln ? lineMs(fillLine(lines?.[ln]), rate) : 0, pause: st.pause ?? LINE_PAUSE_MS, minMs: st.ms, hasLine: !!ln, quiet: lineVoiced(lines, ln), plan: countdownPlan({ soft: !!st.soft }) }) }
  useEffect(() => { if (!on) return undefined; warmCountdown(race); return releaseCountdown }, [on, race]) // ноты отсчёта декодируются заранее (первая должна прозвучать вовремя)

  // Реплика стадии и отсчёт (стартует, когда Пит договорил, и не отпускает стадию до конца нот); смена стадии, пауза и выход гасят таймеры и ноты
  const [gate] = useState(createCountGate)
  useEffect(() => {
    if (!running || (!lineOf(running) && !running.count)) return undefined
    const t = timingOf(running), ids = []
    let stopCount = null
    if (lineOf(running)) ids.push(setTimeout(() => sayLine(lineOf(running)), t.lineAt))
    if (t.countAt != null) stopCount = scheduleStageCount({ countAt: t.countAt, busyLeft: () => cat.busyLeft(), gate, soft: !!running.soft })
    return () => { ids.forEach(clearTimeout); stopCount?.() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, at])

  // Тишина экрана: пока Пит говорит озвученную реплику на старте стадии (или итога), на экране только дорожки и кот
  const quietLine = !running ? null : running.type === 'summary' ? doneLine : lineOf(running)
  const quiet = usePitQuiet({
    on, key: quietLine ? `${running.idx}:${at}` : null, voiced: lineVoiced(lines, quietLine), order: running?.count ?? null, busyLeft: () => cat.busyLeft(),
    timing: () => ({ lineAt: running.type === 'summary' ? 0 : timingOf(running).lineAt, lineMs: lineMs(fillLine(lines?.[quietLine]), rate) }),
  })

  // Дубль и зеркало на дорожках: когда Пит договорил реплику стадии mirror, на остановленных дорожках появляется сравнение (раскладка — rh.compare, рисует движок пилюль; сам экран — mirror/MirrorCompare.jsx)
  const compare = useCompareScene({ active: running?.type === 'mirror' && !quiet.quiet, mirror: take.mirror, chunks: plan?.chunks })

  // «Без текста»: слушатель молчит 3 с — Пит подсказывает первое слово, подпись куска на 2 с
  useEffect(() => {
    if (running?.act !== 'blind' || !running.hintWord) return undefined
    let last = Date.now(), shown = 0, labelTimer = 0, wordTimer = 0
    const id = setInterval(() => {
      last = Math.max(last, listenerRef.current?.heardAt?.() ?? 0)
      if (shown >= MAX_STUCK_HINTS || Date.now() - last < STUCK_MS || cat.busyLeft() > 0) return
      const h = stuckHint(running, shown)
      shown += 1; last = Date.now()
      if (h.kind === 'word') wordTimer = sayWordHint({ word: h.word, lines, rate, sayLine, sayText }) // перевод куска не озвучивается — только подпись
      setS(p => ({ ...p, hint: [hintEntry(h)] }))
      clearTimeout(labelTimer)
      labelTimer = setTimeout(() => setS(p => ({ ...p, hint: [] })), HINT_LABEL_MS)
    }, 400)
    return () => { clearInterval(id); clearTimeout(labelTimer); clearTimeout(wordTimer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, at])

  // Итог: симуляция памяти и XP — один раз на выходе на экран summary
  useEffect(() => {
    if (running?.type !== 'summary' || race) return undefined // у гонки итог считает useRaceActs
    const t = setTimeout(() => { setResult(plan.only === 'summary' ? reportSession({ plan, ...demoSummary(plan) }) : reportSession({ plan, journal, mirror: take.mirror })); sayLine(doneLine) }, 0) // «Шлифовка → Итог»: результат подставной (polish/polishDemo.js)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  return {
    on, result, journal, quiet: quiet.quiet, plateOk: quiet.plateOk,
    /** Сколько мс Пит ещё занят: реплика + пауза после неё (LINE_PAUSE_MS ≈ 40 кадров). Движок пилюль не выкатывает новую пилюлю, пока > 0 (stepStudent hold): выезд — через ~0,6 с после конца реплики; без плана 0 */
    pitLeft: () => (on ? cat.busyLeft() : 0),
    /** Пит говорит реплику (вердикт зеркала — mirror/MirrorCompare.jsx) и «замолчи» перед выходом из зеркала (иначе занятый Пит пропустит реплику итога) */
    say: sayLine, hush: cat.stop,
    /** Стадия просит следующую: если отсчёт тремя нотами ещё не доиграл, переход ждёт его конца */
    afterCount: fn => gate.after(fn),
    /** Экран зеркала: { dictor, student, measure, note, tempo } (записи нет — student и measure null) */
    mirror: take.mirror,
    /** Раскладка сравнения на дорожках (mirrorCompare.compareLayout) или null: не стадия mirror, Пит ещё говорит, дубля нет */
    compare,
    /** Стадия закончилась: дубль сначала дописывается (запись, слова), потом go(); остальные стадии — сразу go() */
    leave: take.leave,
    tag: running?.tag ?? '',
    /** Реакция движка на ступени: 'win' | 'miss' | 'fail' → журнал; первый промах разминки — реплика Пита */
    rec(kind) {
      if (!running) return
      const had = (journal.stages[running.sid]?.miss ?? 0) + (journal.stages[running.sid]?.fail ?? 0)
      record(journal, running, kind)
      if (kind === 'miss' && !had && (running.act === 'warmup' || running.act === 'word')) sayLine(missLine())
    },
    /** Реплика на «не успел»: в разминке — «это слово и будем тренировать»; иначе null (обычные реплики игры) */
    failLine: st => (st?.act === 'warmup' || st?.act === 'word' ? missLine() : null),
    /** Следующая стадия, на которую идём: пропущенные по правилам (cond) обходятся */
    nextIdx,
    /** Сколько держать плашку (announce / turn): пока Пит договорит прошлую реплику и скажет свою */
    holdMs: st => (!on || (!lineOf(st) && !st?.count) ? st.ms : timingOf(st).holdMs),
    /** Конец сигнала перед пилюлями на плашке (мс от её начала: реплика Пита / последняя нота): от него зажигается конвейер (wordLaneConveyorStart.js); null — сигнала нет, берётся конец плашки */
    cueMs: st => (on && (lineOf(st) || st?.count) ? plateCueMs({ order: st.count ?? null, timing: timingOf(st), lineMs: lineOf(st) ? lineMs(fillLine(lines?.[lineOf(st)]), rate) : 0, voiced: lineVoiced(lines, lineOf(st)), soft: !!st.soft }) : null),
    /** Дорожки со слабыми словами разминки: в «без текста» у них видна подпись */
    hintLanes: st => (on && st?.act === 'blind' && st.type === 'student' ? weakLanes(journal, stages) : []),
  }
}
