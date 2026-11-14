import { describe, it, expect } from 'vitest'
import { arrivalAt, leaveAt, ARR, IMPACT, LAND, LEAVE, ARRIVAL_END, flightPath, talkLevel, MOUTH_LEVEL } from './miaMotion.js'

describe('приход Мии: поза по времени', () => {
  it('до начала падения коробки нет; в падении она выше экрана, потом на земле', () => {
    expect(arrivalAt(0).shown).toBe(false)
    const early = arrivalAt(ARR.FALL0 + 0.05), late = arrivalAt(IMPACT - 0.01)
    expect(early.shown).toBe(true); expect(early.box.dy).toBeLessThan(-0.9); expect(late.box.dy).toBeGreaterThan(-0.05)
    expect(arrivalAt(IMPACT + 0.3).box.dy).toBe(0)
  })
  it('клапаны задираются в падении (десятки градусов) и ложатся на пол после удара', () => {
    expect(arrivalAt(0.5).box.thNear).toBeGreaterThan(40); expect(arrivalAt(0.5).box.thFar).toBeGreaterThan(30)
    expect(arrivalAt(IMPACT + 1.0).box.thNear).toBeLessThan(1)
  })
  it('голова Пита скрыта с удара, глаза закрыты до ARR.EYES и потом открываются', () => {
    expect(arrivalAt(IMPACT - 0.05).hideCat).toBe(false); expect(arrivalAt(IMPACT + 0.01).hideCat).toBe(true)
    expect(arrivalAt(ARR.EYES - 0.05).eyes.open).toBe(0); expect(arrivalAt(ARR.EYES + 0.3).eyes.open).toBeGreaterThan(0.95)
  })
  it('паника: коробка ездит влево и вправо, потом встаёт на место', () => {
    const xs = []; for (let t = ARR.PANIC0; t < ARR.JUMP; t += 0.02) xs.push(arrivalAt(t).box.dx)
    expect(Math.min(...xs)).toBeLessThan(-20); expect(Math.max(...xs)).toBeGreaterThan(20); expect(Math.abs(arrivalAt(ARRIVAL_END).box.dx)).toBeLessThan(0.5)
  })
  it('Мия: за кадром → прыжок → сидит; на посадке коробка прогибается, Пит зажмуривается ненадолго', () => {
    expect(arrivalAt(ARR.JUMP - 0.1).mia.mode).toBe('off'); expect(arrivalAt(ARR.JUMP + 0.2).mia.mode).toBe('flight'); expect(arrivalAt(LAND + 0.5).mia.mode).toBe('seat')
    const sag = []; for (let t = LAND; t < LAND + 0.3; t += 0.01) sag.push(arrivalAt(t).box.sy)
    expect(Math.min(...sag)).toBeLessThan(0.98)
    const blink = []; for (let t = LAND; t < LAND + 1.2; t += 0.02) blink.push(arrivalAt(t).eyes.open)
    expect(Math.min(...blink)).toBeLessThan(0.1); expect(blink.at(-1)).toBeGreaterThan(0.95)
  })
})

describe('уход Мии', () => {
  it('присела (коробка дрожит), потом отпрыгнула вправо за экран с коробкой в лапах; Мия едет на коробке', () => {
    const crouch = leaveAt(0.2), jump = leaveAt(LEAVE.CROUCH + 0.4), late = leaveAt(LEAVE.END - 0.05)
    expect(crouch.mia.mode).toBe('seat'); expect(crouch.mia.sy).toBeLessThan(1); expect(crouch.box.dxw).toBe(0)
    expect(jump.box.dxw).toBeGreaterThan(0.1); expect(jump.box.dy).toBeLessThan(-0.2); expect(jump.mia.mode).toBe('seat')
    expect(late.box.dxw).toBeGreaterThan(1.0); expect(leaveAt(LEAVE.END).shown).toBe(false); expect(leaveAt(LEAVE.END).mia.mode).toBe('off')
  })
  it('глаза на коробке закрываются, когда Мия берёт её, и закрыты всё время полёта', () => {
    expect(leaveAt(0.05).eyes.open).toBe(1)
    for (const t of [LEAVE.CROUCH + 0.05, LEAVE.CROUCH + 0.5, LEAVE.END - 0.05]) expect(leaveAt(t).eyes.open, `t=${t}`).toBeLessThan(0.05)
  })
  it('голова Пита возвращается, когда коробка уже поднялась (до конца ухода)', () => {
    expect(leaveAt(0.1).hideCat).toBe(true); expect(leaveAt(LEAVE.CAT_BACK + 0.01).hideCat).toBe(false); expect(LEAVE.CAT_BACK).toBeLessThan(LEAVE.END)
  })
})

describe('вспомогательное', () => {
  it('громкость речи: Rhubarb-коды и closed / half / open; неизвестное — тишина', () => {
    expect(talkLevel('D')).toBe(MOUTH_LEVEL.D); expect(talkLevel('X')).toBe(0); expect(talkLevel(null, 'open')).toBe(1); expect(talkLevel(null, 'half')).toBe(0.5); expect(talkLevel(null, null)).toBe(0)
  })
  it('путь прыжка: начало и конец в заданных точках, середина выше хорды', () => {
    const a = [400, 100], b = [200, 600]
    expect(flightPath(0, a, b)).toEqual({ x: 400, y: 100 }); expect(flightPath(1, a, b)).toEqual({ x: 200, y: 600 })
    expect(flightPath(0.5, a, b, 0.34).y).toBeLessThan(350)
  })
})

describe('живые глаза в щели', () => {
  it('взгляд в пределах щели, моргание быстро закрывает и открывает; в покое после посадки глаза живут', async () => {
    const { eyeLife } = await import('./miaMotion.js')
    const looks = [], blinks = []
    for (let t = 0; t < 30; t += 0.02) { const l = eyeLife(t); looks.push(l.look); blinks.push(l.blink) }
    expect(Math.max(...looks)).toBeLessThan(6); expect(Math.min(...looks)).toBeGreaterThan(-6); expect(new Set(looks.map(x => Math.round(x))).size).toBeGreaterThan(4)
    expect(Math.min(...blinks)).toBeLessThan(0.1); expect(blinks.filter(b => b < 0.99).length).toBeLessThan(blinks.length * 0.15) // моргает редко и коротко
    const idle = []; for (let t = LAND + 1; t < LAND + 11; t += 0.05) idle.push(arrivalAt(t).eyes.look)
    expect(new Set(idle.map(x => x.toFixed(1))).size).toBeGreaterThan(10)
  })
  it('до падения коробки и после ухода её не показывают (мерцание за кадр до падения)', () => {
    expect(arrivalAt(0.01).shown).toBe(false); expect(arrivalAt(ARR.FALL0 + 0.01).shown).toBe(true); expect(leaveAt(LEAVE.END + 0.1).shown).toBe(false)
  })
})
