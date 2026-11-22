import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { stageTiming, lineTailOf, countdownMs, countdownPlan } from '../rehearsal/rehearsalCountdown.js'
import { buildStages } from '../player/modules/rotate-phone/wordLaneStages.js'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'
import { PHRASE_FIXTURE } from './racePhraseFixture.js'
import { PHRASE_LINE_TAIL_MS } from './raceStagesPhrases.js'
import { startPhraseCount } from './racePhraseCount.js'

// Решение владельца 2026-11-22: «паузы сократи» (таймлайн игры v3.3.339).
// Б. Пит «Конвейер ситуаций, подбери фразу к ситуации» кончил в +152,529 с, «я описываю ситуацию…» начал в +154,770 с: 2,24 с. Стадия phrases-ann держалась после реплики ещё 260 + 1700 мс
//    («плашка выходит ПОСЛЕ речи Пита и стоит stage.ms» — а у этой стадии плашка выходит ВМЕСТЕ с репликой, plateWithLine), потом 250 + 20 мс до реплики следующей стадии.
// А. Пит «а теперь скажи её сам…» кончил в +199,037 с, диктор «скажи, что рад знакомству» начал в +201,761 с: это не тишина, а отсчёт тремя нотами после демо (2,5 с, решение v3.3.220) — его не было в трассе сцены.
const LINE = 3199, LEAD = 250, CAT_PAUSE = 600 // длина реплики race_phrases из журнала; задержка реплики стадии; пауза «занят» после реплики кота
const stages = (() => { const p = { ...normalizePlan({ ...fixturePlan('three'), game: 'race' }), phrases: PHRASE_FIXTURE }; return buildStages({ chunks: p.chunks, plan: p, rate: 1 }).stages })()
const ann = stages.find(s => s.sid === 'phrases-ann')

/** От конца реплики стадии до начала реплики следующей стадии, мс: стадия держится holdMs, следующая реплика — через LEAD + остаток «занят» + 20 */
function gapMs(st, catPause) {
  const t = stageTiming({ lead: LEAD, lineMs: LINE, hasLine: true, ...lineTailOf(st, { pause: CAT_PAUSE, minMs: st.ms, quiet: true }) })
  const end = t.lineAt + LINE, busy = Math.max(0, end + catPause - t.holdMs)
  return t.holdMs + LEAD + busy + 20 - end
}

describe('«Фразы»: между репликами двух плашек подряд ≈ 0,5 с', () => {
  it('было: 2,2 с (хвост стадии 260 + 1700 мс после реплики)', () => {
    expect(gapMs({ ms: 1700 }, CAT_PAUSE)).toBeGreaterThan(2100)
  })
  it('стало: стадия «Конвейер ситуаций» кончается через PHRASE_LINE_TAIL_MS после реплики — до «я описываю ситуацию…» 0,4–0,6 с', () => {
    expect(ann).toMatchObject({ plateWithLine: true, lineTail: PHRASE_LINE_TAIL_MS })
    const gap = gapMs(ann, ann.lineTail)
    expect(gap).toBeGreaterThanOrEqual(400); expect(gap).toBeLessThanOrEqual(600)
  })
  it('короткий хвост — только у этой стадии; у остальных раскладка прежняя', () => {
    expect(stages.filter(s => s.lineTail != null).map(s => s.sid)).toEqual(['phrases-ann'])
    const base = { pause: 600, minMs: 1700, quiet: true }
    expect(lineTailOf({ ms: 1700 }, base)).toBe(base); expect(lineTailOf(null, base)).toBe(base)
    expect(lineTailOf({ lineTail: 230 }, base)).toEqual({ pause: 230, minMs: 0, quiet: false })
  })
  it('проводка: директор берёт хвост стадии и для раскладки, и для паузы «занят» после реплики', () => {
    const src = readFileSync(new URL('../rehearsal/useRehearsalActs.js', import.meta.url), 'utf8')
    expect(src).toContain('...lineTailOf(st, {'); expect(src).toContain('running.lineTail != null ? { pause: running.lineTail } : null')
  })
})

describe('«Скажи»: отсчёт после демо виден на таймлайне как отсчёт, а не как «игра молчит»', () => {
  it('три ноты после демо пишутся в трассу сцены (count / count-end)', () => {
    const trace = vi.fn(); let done = null
    const count = vi.fn(o => { done = o.onDone; return () => {} }), onDone = vi.fn()
    startPhraseCount({ cfg: { mode: 'say', countAfter: true }, from: 0, count, onDone, trace })
    expect(trace).toHaveBeenCalledWith('count', { what: '«Скажи» (после демо)', ms: countdownMs(countdownPlan({ soft: true })) })
    done(); expect(trace).toHaveBeenCalledWith('count-end', {}); expect(onDone).toHaveBeenCalled()
  })
  it('отсчёт не нужен (продолжение с середины круга) — в трассе ничего', () => {
    const trace = vi.fn(); expect(startPhraseCount({ cfg: { mode: 'say', countAfter: true }, from: 2, count: vi.fn(), trace })).toBeNull(); expect(trace).not.toHaveBeenCalled()
  })
})
