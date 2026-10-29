import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const lines = rel => { const t = read(rel); return t.endsWith('\n') ? t.split('\n').length - 1 : t.split('\n').length }
const RP = '../player/modules/rotate-phone/'

// Проводка «Репетиции с Питом» в игру (аудит исходников): директор вызывает акты из одной точки, движок остаётся прежним, файлы небольшие
describe('директор игры (useWordLaneFlow)', () => {
  const flow = read(`${RP}useWordLaneFlow.js`)
  it('план приходит в стадии (buildStages delegates), акты — хук useRehearsalActs, пропуски — nextIdx', () => {
    expect(flow).toContain("import { useRehearsalActs } from '../../../rehearsal/useRehearsalActs.js'")
    expect(flow).toContain('confusers = null, plan = null, forceDebug = false, onFinished })')
    expect(flow).toContain('const rh = useRehearsalActs({ plan, stages, stage: s.stage, at: s.at, stageObj, setS, sayLine,')
    expect(flow).toContain('const i = nextIdx(sRef.current.idx + 1)')
  })
  it('новые типы стадий видны движку как прежние (engineKind): сцена, фаза, слушатель, кот', () => {
    expect(flow).toContain("if (kind === 'dictor') return { kind: 'dictor', plan: stageObj.plan, at: s.at }")
    expect(flow).toContain("if (kind === 'student') return { kind: 'student', step: stageObj.step, chunks: stageObj.step.chunks ?? chunks, estMs: c => (stageObj.step.chunkMs ?? chunkMs)[c]")
    expect(flow).toContain("const phase = s.stage === 'run' ? (engineKind(stageObj) ?? 'idle') : s.stage")
    expect(flow).toContain('stepTargets(listenStep, listenStep.chunks ?? chunks)')
    expect(flow).toContain('targets: [...texts, ...(listenStep.extra ?? [])], expected: listenStep.reps.length, maxWords: listenStep.maxWords')
    expect(flow).toContain("else if (engineKind(stageObj) === 'dictor') releaseHold = scheduleDictor")
    expect(flow).toContain('else if (isStudentStage(stageObj)) look()?.lineStart()')
  })
  it('реакции движка попадают в журнал актов (win / miss / fail); «не успел» в разминке — реплика Пита; «Различи» называет слово', () => {
    expect(flow).toContain("rh.rec('win'); if (playNote(order))")
    expect(flow).toContain("miss() { rh.rec('miss');")
    expect(flow).toContain("rh.rec('fail')")
    expect(flow).toContain("sayLine(rh.failLine(st) ?? (st?.step?.reps?.[0]?.parts?.length > 1 ? 'split_words' : 'try_again'))")
    expect(flow).toContain('const word = stages[sRef.current.idx]?.sayText; if (word) { handlers.sayText(word); return }')
  })
  it('плашки держатся, пока Пит говорит (holdMs); директор отдаёт rh и next для экранов зеркала и итога', () => {
    expect(flow).toContain('ids.push(setTimeout(next, rh.holdMs(stageObj)))')
    expect(flow).toContain('return { ...s, dbg, rh, next, catLine: cat.text, phase,')
  })
  it('дубль и зеркало: слушатель дубля без затвора и без паузы между заходами; на дубле Пит молчит; стадия закончилась — rh.leave дописывает дубль и только потом next', () => {
    expect(flow).toContain('gate: !listenStep.record, restartMs: listenStep.record ? 0 : undefined')
    expect(flow).toContain("const said = e.order || st?.type === 'take' ? false : sayLine(rh.failLine(st)")
    expect(flow).toContain("later(() => rh.leave(stages[at], () => { if (sRef.current.idx === at && sRef.current.stage === 'run') next() }), EXIT_PAUSE_MS)")
    expect(flow).toContain('cat, lines, rate, lang, listenerRef })')
    expect(flow).not.toMatch(/onChange: \(\{[^}]*words/) // слова Vosk в onChange не идут (перерисовок не плодят)
  })
  it('директор не раздулся: ≤ 250 строк; ручного режима по-прежнему нет', () => {
    expect(lines(`${RP}useWordLaneFlow.js`)).toBeLessThanOrEqual(250)
    expect(flow).not.toMatch(/tapMic|\bskip\b|'manual'/)
  })
})

describe('дубль и зеркало (акт 5)', () => {
  const acts = read('./RehearsalActs.jsx'), director = read('./useRehearsalActs.js'), take = read('./useRehearsalTake.js')
  it('экран mirror — WordLaneMirror с данными rh.mirror, заглушка удалена целиком', () => {
    expect(acts).toContain("import WordLaneMirror from './mirror/WordLaneMirror.jsx'")
    expect(acts).toContain("{type === 'mirror' && rh.mirror && (")
    expect(acts).toContain('<WordLaneMirror dictor={rh.mirror.dictor} student={rh.mirror.student} chunks={cfg.plan.chunks} measure={rh.mirror.measure} note={rh.mirror.note} onDone={f.next} />')
    expect(existsSync(new URL('./RehearsalMirrorStub.jsx', import.meta.url))).toBe(false)
    expect(acts).not.toMatch(/MirrorStub|Зеркало — скоро/)
    expect(read('../../../STRUCTURE.md')).not.toContain('RehearsalMirrorStub')
  })
  it('директор актов: запись и зеркало — useRehearsalTake, темп и заметка идут в итог (reportSession)', () => {
    expect(director).toContain("import { useRehearsalTake } from './useRehearsalTake.js'")
    expect(director).toContain('const take = useRehearsalTake({ plan, running, at, listenerRef, rate, lang })')
    expect(director).toContain('reportSession({ plan, journal, mirror: take.mirror })')
    expect(director).toContain('mirror: take.mirror,')
    expect(director).toContain('leave: take.leave,')
  })
  it('запись — на ГОТОВОМ потоке игры (getGameMic через guardStream), второго getUserMedia и второго Vosk нет; готовый дубль освобождается', () => {
    expect(take).toContain('getStream: guardStream(getGameMic)')
    expect(read('./rehearsalTake.js') + take + read('./rehearsalMirror.js')).not.toMatch(/getUserMedia|startListening|listenTake|voskRuntime/)
    expect(take).toContain('releaseTake(takeRef.current)')
    expect(take).toContain('cancel()')
  })
  it('демо слушает Vosk напрямую (mirrorListen) — только в админском демо-блоке, в игре не используется', () => {
    const files = readdirSync(fileURLToPath(new URL('./', import.meta.url))).filter(f => /\.jsx?$/.test(f) && !/\.test\./.test(f))
    expect(files.filter(f => read(`./${f}`).includes('mirrorListen'))).toEqual([])
  })
})

describe('игра, модуль, настройки, звук', () => {
  it('WordLaneGame: план в директор, одно слово репетиции не «крупно», один рендер актов и атрибуты акта на корне', () => {
    const game = read(`${RP}WordLaneGame.jsx`)
    expect(game).toContain("import RehearsalActs from '../../../rehearsal/RehearsalActs.jsx'")
    expect(game).toContain('plan: cfg.plan, forceDebug, onFinished })')
    expect(game).toContain("phase !== 'discern' && !cfg.plan")
    expect(game).toContain('<RehearsalActs f={f} cfg={cfg} onAgain={onAgain} />')
    expect(game).toContain('data-act={f.rh.on ? f.stageObj?.act : undefined}')
  })
  it('RotatePhoneModule: «Ещё минутку?» — следующий план и перезапуск игры в том же тапе; по концу игры — снова план ноды', () => {
    const mod = read(`${RP}RotatePhoneModule.jsx`)
    expect(mod).toContain("import { nextPlan } from '../../../rehearsal/rehearsalCfg.js'")
    expect(mod).toContain('const cfg = useMemo(() => (plan ? readWordLane({ plan }) : nodeCfg), [plan, nodeCfg])')
    expect(mod).toContain('flushSync(() => { setPlan(next); setGameKey(k => k + 1) })')
    expect(mod).toContain('onAgain={cfg.plan ? another : null}')
    expect(mod).toContain('leaveFullscreen(); setPlan(null)')
  })
  it('readWordLane принимает rotate_phone.plan; тап «Начать» готовит слова репетиции; реплики Пита — в каталоге реплик кота', () => {
    expect(read(`${RP}wordLaneConfig.js`)).toContain('const rehearsal = td.plan ? readRehearsalCfg(td.plan) : null')
    expect(read(`${RP}wordLaneStart.js`)).toContain('...(cfg.extraWords ?? [])')
    expect(read(`${RP}wordLaneCatLines.js`)).toContain('export const CAT_LINES = [...GAME_LINES, ...REHEARSAL_LINES]')
    expect(read(`${RP}wordLaneStages.js`)).toContain('if (plan) return buildRehearsalStages({ plan, rate, lib })')
    expect(read(`${RP}wordLaneStages.js`)).toContain('if (stage?.act) return labelsForRehearsal(stage, chunks, hint, hl)')
  })
  it('стили подключены в index.css; не трогаем чужие файлы стилей пилюль и микрофона', () => {
    expect(read('../../index.css')).toContain("@import './styles/player/modules/rehearsal.css';")
    expect(read('../../styles/player/modules/rehearsal.css')).toContain('.rhTag')
  })
})

describe('размеры файлов (CLAUDE.md: один файл — одна ответственность, ≤ 400, ориентир 250)', () => {
  it('новые файлы репетиции не длиннее 250 строк', () => {
    const dir = fileURLToPath(new URL('./', import.meta.url))
    const files = readdirSync(dir).filter(f => /\.(jsx?|css)$/.test(f))
    expect(files.length).toBeGreaterThan(10)
    for (const f of files) expect(lines(`./${f}`), f).toBeLessThanOrEqual(250)
    for (const f of ['GameTestRehearsal.jsx', 'GameTestBlock.jsx']) expect(lines(`../admin/speech/${f}`), f).toBeLessThanOrEqual(250)
    expect(lines('../../styles/player/modules/rehearsal.css')).toBeLessThanOrEqual(250)
  })
  it('STRUCTURE.md описывает каждый новый файл', () => {
    const st = read('../../../STRUCTURE.md')
    for (const f of readdirSync(fileURLToPath(new URL('./', import.meta.url))).filter(x => /\.(jsx?|css)$/.test(x) && !/^(scratch)/.test(x))) expect(st, f).toContain(`\`${f}\``)
    for (const f of ['GameTestRehearsal.jsx', 'rehearsal.css']) expect(st, f).toContain(f)
  })
})
