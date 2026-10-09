import { describe, it, expect } from 'vitest'
import { analyzeStartLog } from './analyzeStartLog.js'
import { jumpRec, goodRec } from './startLogFixtures.js'

const sus = r => analyzeStartLog(r).suspects
const by = (r, code) => sus(r).filter(s => s.code === code)

describe('analyzeStartLayout: подозрения по раскладке', () => {
  const rec = jumpRec()

  it('safe-area изменился после первого кадра — с точным t и пометкой «не видно/видно»', () => {
    const s = by(rec, 'safe-area')
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ level: 'warn', t: 2400 })
    expect(s[0].text).toContain('0px/0px/0px/0px -> 0px/0px/34px/0px')
    expect(s[0].text).toContain('t=2400ms')
    expect(s[0].text).toContain('под непрозрачным сплэшем — не видно')
  })

  it('рамка нижней панели сместилась (y 772 -> 738, высота 40 -> 74)', () => {
    const s = by(rec, 'rect-nv')
    expect(s).toHaveLength(1)
    expect(s[0].t).toBe(2400)
    expect(s[0].text).toContain('0,772,402x40 -> 0,738,402x74')
  })

  it('появление панели и ленты ("-" -> значение) не считается скачком', () => {
    expect(by(rec, 'rect-fe')).toEqual([])
    expect(by(rec, 'rect-nv').every(s => s.t === 2400)).toBe(true)
  })

  it('после ухода сплэша: смена цвета слоя под экраном и верхнего элемента помечаются «ВИДНО»', () => {
    const c = by(rec, 'under-color')
    expect(c).toHaveLength(1)
    expect(c[0].text).toContain('html/rgb(0,0,0) -> div#feedV2/rgb(11,13,16)')
    expect(c[0].text).toContain('ВИДНО')
    expect(by(rec, 'layer-top')).toEqual([]) // верхний слой был сплэшем — его уход не «посторонний»
  })

  it('смена элемента под центром под непрозрачным сплэшем — только info', () => {
    const l = by(rec, 'layer')
    expect(l.length).toBeGreaterThan(0)
    expect(l[0].level).toBe('info')
  })

  it('виртуальный скачок окна, прокрутка и посторонний верхний слой', () => {
    const r = goodRec()
    r.ev.push([500, 'sample', 'iw=402x812 ch=812 sy=0/0/0 ep=div#a'], [600, 'sample', 'iw=402x874 sy=0/59/0 ep=div#b'])
    const c = sus(r).map(s => s.code)
    expect(c).toContain('view-iw')
    expect(c).toContain('scroll')
    expect(c).toContain('layer-top')
  })

  it('прозрачность видео и постер в растворении', () => {
    const r = goodRec()
    r.ev = r.ev.filter(e => e[1] !== 'sample')
    r.ev.push([100, 'sample', 'so=1 vo=0 ps=bg,1'], [1210, 'sample', 'so=0.9 vo=1 ps=0'])
    const c = sus(r).map(s => s.code)
    expect(c).toContain('video-opacity')
    expect(c).toContain('poster')
  })

  it('здоровый старт без новых полей — без подозрений', () => {
    expect(sus(goodRec()).filter(s => s.level === 'warn')).toEqual([])
  })

  it('не больше 8 одинаковых подозрений на старт', () => {
    const r = goodRec()
    for (let i = 0; i < 30; i++) r.ev.push([500 + i * 10, 'sample', `iw=40${i % 2}x800`])
    expect(by(r, 'view-iw').length).toBe(8)
  })
})
