import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { OFFSCREEN_IDS, SPEED_ID, plateEndAt } from './useMiaPlate.js'
import { BOSS } from './raceMia.js'
import { IMPACT } from './miaMotion.js'
import { REV_WAIT_CAP_MS } from '../raceReverseTurn.js'
import { PLEASED_MS } from './useMiaTail.js'
import { ARR } from './miaMotion.js'
import { miaColorOn } from './miaTint.js'
import { conveyorSpeedHint } from '../../player/modules/rotate-phone/wordLaneConveyorSpeed.js'
import { MIA } from './raceMia.js'
import { buildRaceStages } from '../raceStages.js'

// v3.3.272: плашка Мии — только пока она говорит за кадром, до прыжка; дорожки желтеют и конвейер ускоряется с её первой реплики (владелец, логи v3.3.271)
const plan = { game: 'race', seed: 's1', chunks: ['learn', 'meet', 'nice', 'trying'], words: ['learn', 'meet', 'nice', 'trying'].map(text => ({ text, translation: `ru ${text}`, confusers: [] })), phrases: [] }
const rd = p => readFileSync(new URL(p, import.meta.url), 'utf8')

describe('плашка Мии по реплике за кадром', () => {
  it('за кадром говорит Мия в mia_push (церемония) и boss_mia_hush (финал); плашка гаснет в момент прыжка: падение + jumpAt (по умолчанию ARR.JUMP)', () => {
    expect(OFFSCREEN_IDS).toEqual(['mia_push', 'boss_mia_hush'])
    expect(plateEndAt(1000, undefined)).toBe(1000 + ARR.JUMP * 1000); expect(plateEndAt(1000, 6.4)).toBe(1000 + 6400)
  })
  it('стадии: плашку несёт стадия церемонии (miaPlate + look Мии), стадии-«плашки» перед ней в игре плашки не показывают', () => {
    const st = buildRaceStages({ plan: plan, tap: false, ru: true }).stages
    const ann = st.filter(s => s.mia === 'ann' && s.act !== 'boss'); expect(ann.length).toBeGreaterThan(0)
    for (const s of ann) { expect(s.miaPlate.title).toBe('Допрос у Мии'); expect(s.round.look).toEqual({ cat: 'mia' }) }
    const src = rd('../useRaceActs.js'); expect(src).toContain("st?.mia === 'intro' || st?.sid === 'boss-intro-ann' ? ''"); expect(src).toContain('miaPlate.go')
  })
  it('цвета Мии на церемонии после A — с её первой реплики за кадром (spoke), конвейер набирает скорость круга с Мией заранее', () => {
    const m = { phase: 'in', fast: false }, ann = { sid: 'sprint3-ann', mia: 'ann' }
    expect(miaColorOn(m, ann, true, false)).toBe(false); expect(miaColorOn(m, ann, true, true)).toBe(true)
    const stages = [{ race: true, act: 'sprint', mia: 'ann', type: 'announce' }, { race: true, act: 'sprint', type: 'student', mia: 'round', step: { reps: [{ speed: 1.4 }] } }]
    expect(conveyorSpeedHint(stages, 0, false)).toBe(1.4); expect(conveyorSpeedHint(stages, 0, true)).toBeCloseTo(1.4 * MIA.BOOST, 6)
  })
  it('комментарий: кнопка 💬 отпускает микрофон по-настоящему (iOS-диктовка), «Продолжить» откроет его заново', () => {
    const b = rd('../../player/modules/rotate-phone/WordLaneCommentButton.jsx')
    expect(b).toContain("shutGameMic('комментарий: диктовка')"); expect(b.indexOf("f.pause('comment')")).toBeLessThan(b.indexOf('shutGameMic('))
  })
  it('ускорение дорожек — только на реплике «я ускоряю игру» (mia_announce_2), плашка и цвет — раньше, с реплики за кадром', () => {
    expect(SPEED_ID).toBe('mia_announce_2'); expect(rd('../../player/modules/rotate-phone/WordLaneGame.jsx')).toContain('!!f.rh.miaPlate?.speedUp')
  })
  it('финал (v3.3.280): коробка падает сразу (DROP_AT), реплика Пита — уже после удара коробки (PIT1_AT ≥ DROP_AT + IMPACT), прыжок Мии — к JUMP_ABS', () => {
    expect(BOSS.PIT1_AT).toBeGreaterThanOrEqual(BOSS.DROP_AT + IMPACT * 1000)
    const src = rd('./useMiaEnter.js'); expect(src).toContain('const bossDrop = boss ? BOSS.DROP_AT'); expect(src).toContain('BOSS.JUMP_ABS + shift - bossDrop')
    expect(BOSS.HUSH_AT).toBeGreaterThan(BOSS.PIT1_AT + 3000) // Мия не перебивает первую реплику Пита
  })
  it('разворот в реверс: стадия не ждёт реплику Пита про реверс целиком (REV_WAIT_CAP_MS), плашка фраз выходит вместе с репликой', () => {
    expect(REV_WAIT_CAP_MS).toBeLessThanOrEqual(1000)
    expect(rd('../raceStagesPhrases.js')).toContain('plateWithLine = true'); expect(rd('../../rehearsal/useRehearsalActs.js')).toContain('running.plateWithLine ? null')
  })
  it('комментарий к логам (SendLogButton): микрофон игры отпускается при открытии попапа', () => {
    expect(rd('../../../shared/ui/SendLogButton.jsx')).toContain("shutGameMic('комментарий к логам: диктовка')")
  })
  it('v3.3.274: выход перед Мией коротким (miaComesNext видит стадию-плашку intro), хвост Мии — игривый, на верный ответ прямее и пушистее', () => {
    expect(rd('../useRaceActs.js')).toContain('/^(sprint|catch)3-(intro-)?ann$/'); expect(MIA.EXIT_MS).toBeLessThanOrEqual(300)
    const css = rd('../../../styles/player/modules/race-mia.css'); expect(css).toContain('miaTailSlot4'); expect(css).toContain("[data-tail='pleased']"); expect(css).toContain('--tail-up') // v3.3.292: хвост — 27 кадров по слотам CSS; «довольна» — пушистее, движение не замирает
    expect(rd('../RaceMia.jsx')).toContain("data-tail={pleased ? 'pleased' : undefined}");  expect(PLEASED_MS).toBeGreaterThan(1500)
  })
})
