import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { laneTape, TAPE_ACTS } from '../../player/modules/rotate-phone/wordLaneTape.js'

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8')

describe('финал «Шкала памяти»: подключение', () => {
  it('лента и широкая пилюля: акт boss едет на ленте, step.wide даёт широкую пилюлю', () => {
    expect(TAPE_ACTS).toEqual(['phrases', 'boss'])
    expect(laneTape({ rh: { on: true }, stage: 'run', stageObj: { act: 'boss' } })).toBe(true); expect(laneTape({ rh: { on: true }, stage: 'run', stageObj: { act: 'sprint' } })).toBe(false)
    expect(read('../../player/modules/rotate-phone/useWordLanePills.js')).toContain('wide: !!step.wide')
  })
  it('директор: Пит говорит перевод и на финале, «не успел» даёт отступ, слова вписываются перед входом', () => {
    const src = read('../useRaceActs.js')
    expect(src).toContain("(act === 'sprint' || (act === 'boss' && running?.step?.lang !== 'ru')) && said"); expect(src).toContain("['sprint', 'catch', 'boss'].includes(running.act)) speech.pillGone"); expect(src).toContain("if (['boss-intro-ann', 'boss-ann'].includes(stages[r]?.sid)) bossFill(stages, box.s, seed)")
  })
  it('игра рисует шкалу только на финале (RaceBossScale live по act boss), стили подключены', () => {
    expect(read('../../player/modules/rotate-phone/WordLaneGame.jsx')).toContain("['boss-ann', 'boss', 'boss-sw', 'boss2'].includes(f.stageObj?.sid)"); expect(read('../../../styles/player/modules/race-sprint.css')).toContain("@import './race-boss.css'")
  })
  it('Пит произносит верный ответ только когда слово не названо / ошибка (fail), верно названное не повторяет; «занят» держится до конца — следующая пилюля после него; красное слово пугает Пита (зрачки)', () => {
    const src = read('../useRaceActs.js')
    const mia = read('../mia/raceMia.js'), sp = read('../mia/miaSpeech.js') // владелец 2026-11-22: «это значит» + верное слово идёт ПОСЛЕ колкости Мии — его ставит в очередь речи машина Мии (было: директор говорил сам сразу, sayCorrect)
    expect(mia).toContain("ru = stage.step?.lang === 'ru', told = ru ? w?.translation : w?.text"); expect(mia).toContain('HELP_LINES[Object.keys(m.dug ?? {}).length % HELP_LINES.length]'); expect(sp).toContain("src.sayText?.(c.word, { hold: true, ...(c.ru ? { ru: true } : {})"); expect(sp).toContain('c.word ? { onEnd: word, pause: 60 }') // v3.3.280: «это значит» + верное слово без паузы
    expect(src).toContain('speech.claim(praiseRef.current); praiseRef.current = null }'); expect(src).not.toContain('sayCorrect'); expect(src).toContain("if (kind === 'fail' && running.act === 'boss') redAlarm()"); expect(src).toContain("if (z === 'slow') redAlarm()")
    expect(read('../../player/modules/rotate-phone/WordLaneGame.jsx')).toContain('alarm={f.rh.miaAlarm}'); expect(read('../RaceMia.jsx')).toContain('pupil: (m.eyes.pupil ?? 1) * (1 - 0.58 * fear)'); expect(read('../mia/boxArt.js')).toContain("class=\"bxPupil\"")
  })
})
