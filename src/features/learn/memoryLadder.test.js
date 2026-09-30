import { describe, it, expect } from 'vitest'
import { levelOf, levelFill, journey, buildLadder, wordLevel, pageTabs, LEVEL_TITLES, LEVELS, LEVEL_COUNT, SETTLED_ABOUT } from './memoryLadder.js'
import { orth, ladderLinks, ballPath, FIN_TOP, orthPoints, taper, mixColor, ladderWireSet, W_MIN, W_MAX, ballScale, haloScale, BALL_D, BALL_GROW, HALO_D, HALO_GROW } from './ladderWires.js'

describe('ступени памяти', () => {
  it('шаг → ступень: 1–2 новые, 3–4 знакомые, 5 усвоенные', () => {
    expect([1, 2, 3, 4, 5].map(levelOf)).toEqual([1, 1, 2, 2, 3])
  })

  it('заливка — путь к следующей ступени, весь путь растёт с шагом', () => {
    expect([1, 2, 3, 4, 5].map(levelFill)).toEqual([0.25, 0.75, 0.25, 0.75, 1])
    const j = [1, 2, 3, 4, 5].map(journey)
    expect(j[4]).toBe(1)
    j.slice(1).forEach((v, i) => expect(v).toBeGreaterThan(j[i]))
  })

  it('слова по ступеням: сегодняшние первыми, дальше по сроку; постоянная память — отдельно', () => {
    const memory = [
      { word: 'go', step: 1, due_on: '2026-09-28' },
      { word: 'keep', step: 2, due_on: '2026-09-27' },
      { word: 'cook', step: 1, due_on: '2026-09-26' },
      { word: 'want', step: 4, due_on: '2026-10-02' },
      { word: 'make', step: 5, due_on: '2026-10-20' },
      { word: 'hello', step: 5, due_on: '2026-11-20', settled_on: '2026-09-20' },
    ]
    const ladder = buildLadder(memory, {
      todayWords: new Set(['go']),
      hasDeck: w => w !== 'keep',
      wordHome: new Map([['go', { lessonId: 'l-go', lessonTitle: 'Go', phrase: 'Let’s go' }]]),
    })
    expect(ladder.levels.map(l => l.words.map(w => w.word))).toEqual([['go', 'cook', 'keep'], ['want'], ['make']])
    expect(ladder.total).toBe(5)
    expect(ladder.permanent.map(w => w.word)).toEqual(['hello'])
    const [go, , keep] = ladder.levels[0].words
    expect(go).toMatchObject({ today: true, hasDeck: true, lessonId: 'l-go', lessonTitle: 'Go', phrase: 'Let’s go' })
    expect(keep).toMatchObject({ today: false, hasDeck: false, lessonId: null, lessonTitle: '', phrase: '' })
  })

  it('уровень слова для окна: n из 4, постоянная память — четвёртый', () => {
    expect(LEVEL_COUNT).toBe(4)
    expect([1, 2, 3, 4, 5].map(s => wordLevel(s).n)).toEqual([1, 1, 2, 2, 3])
    expect(wordLevel(5, true)).toMatchObject({ n: 4, name: 'Слово в постоянной памяти' })
    expect(wordLevel(1).name).toBe('Новое слово')
    expect(wordLevel(3).remember).toMatch(/ты уже узнаёшь/i)
  })

  it('описания: как слово сюда попадает → забывается → что делать → куда перейдёт', () => {
    LEVELS.forEach(l => {
      expect(l.about).toMatch(/забыва|забуд/) // такие слова забываются
      expect(l.about).toMatch(/мы напомним|проверим/) // что мы делаем
      expect(l.about).toMatch(/перейдёт|станет/)      // куда слово пойдёт дальше
    })
    expect(LEVELS[0].about.startsWith('Сюда попадают слова из уроков')).toBe(true)
    // постоянная память: начинаем с того, откуда слова здесь берутся
    expect(SETTLED_ABOUT.startsWith('Тут хранятся слова из «Усвоенных»')).toBe(true)
    expect(SETTLED_ABOUT).toMatch(/вернётся в «Знакомые»/)
  })
})

describe('линии памяти', () => {
  it('ломаная со скруглёнными углами', () => {
    expect(orth([[0, 0], [0, 40], [30, 40]], 10)).toBe('M 0 0 L 0 30 Q 0 40 10 40 L 30 40')
    // короткий отрезок — радиус не больше половины отрезка
    expect(orth([[0, 0], [0, 6], [30, 6]], 10)).toBe('M 0 0 L 0 3 Q 0 6 3 6 L 30 6')
  })

  it('ствол от низа шапки — в левый бок каждой ступени, от «Родных» — в верх пятиугольника', () => {
    const hero = { l: 0, t: 0, r: 300, b: 100 }
    const blocks = [
      { l: 0, t: 140, r: 200, b: 200 }, { l: 50, t: 220, r: 250, b: 280 }, { l: 100, t: 300, r: 300, b: 360 },
    ]
    const fin = { l: 0, t: 400, r: 180, b: 559 }
    const links = ladderLinks({ hero, blocks, fin, edge: -22 })
    expect(links).toHaveLength(4)
    expect(links[1].pts).toEqual([[150, 100], [150, 114], [-11, 114], [-11, 250], [50, 250]])
    expect(links[3].pts.at(-1)).toEqual([90, 400 + 159 * FIN_TOP])
    expect(links[3].pts[0]).toEqual([200, 360])
    // шарик бежит обратно: из ступени к шапке
    expect(ballPath(links[0]).startsWith('M 0 170')).toBe(true)
    expect(ballPath(links[0]).endsWith('L 150 100')).toBe(true)
  })
})

describe('страница уровней', () => {
  const ladder = buildLadder([
    { word: 'go', step: 1, due_on: '2026-09-28' },
    { word: 'cook', step: 3, due_on: '2026-09-28' },
    { word: 'make', step: 5, due_on: '2026-10-20' },
    { word: 'hello', step: 5, due_on: '2026-11-20', settled_on: '2026-09-20' },
  ])

  it('заголовки: «Первый уровень памяти» … «Четвёртый уровень памяти»', () => {
    expect(LEVEL_TITLES).toEqual(['Первый уровень памяти', 'Второй уровень памяти', 'Третий уровень памяти', 'Четвёртый уровень памяти'])
  })

  it('четыре вкладки: три ступени и «Постоянная» с её словами и описанием', () => {
    const tabs = pageTabs(ladder)
    expect(tabs.map(t => t.short)).toEqual(['Новые', 'Знакомые', 'Усвоенные', 'Постоянная'])
    expect(tabs.map(t => t.words.length)).toEqual([1, 1, 1, 1])
    expect(tabs.map(t => t.perm)).toEqual([false, false, false, true])
    expect(tabs[3]).toMatchObject({ id: LEVEL_COUNT, title: 'Четвёртый уровень памяти', name: 'Постоянная память', about: SETTLED_ABOUT })
    expect(tabs[3].words.map(w => w.word)).toEqual(['hello'])
    // пусто — другое описание (как слово сюда попадёт)
    expect(pageTabs(buildLadder([]))[3].about).toMatch(/Тут будут храниться/)
  })
})

describe('связи памяти: толщина растёт от шапки до пятиугольника', () => {
  const hero = { l: 0, t: 0, r: 300, b: 100 }
  const blocks = [
    { l: 0, t: 140, r: 200, b: 200 }, { l: 50, t: 220, r: 250, b: 280 }, { l: 100, t: 300, r: 300, b: 360 },
  ]
  const fin = { l: 0, t: 400, r: 180, b: 559 }

  it('точки скруглённой ломаной — от начала до конца, угол — дугой', () => {
    const pts = orthPoints([[0, 0], [0, 40], [30, 40]], 10, 4)
    expect(pts[0]).toEqual([0, 0])
    expect(pts.at(-1)).toEqual([30, 40])
    expect(pts).toHaveLength(1 + 1 + 4 + 1)
  })

  it('цвет и толщина плавно меняются по длине', () => {
    const pieces = taper([[0, 0], [0, 80]], { s0: 0, s1: 1, c0: '#000000', c1: '#ffffff', maxLen: 8 })
    expect(pieces).toHaveLength(10)
    pieces.slice(1).forEach((p, i) => expect(p.w).toBeGreaterThan(pieces[i].w))
    expect(pieces[0].w).toBeGreaterThanOrEqual(W_MIN)
    expect(pieces.at(-1).w).toBeLessThanOrEqual(W_MAX)
    expect(mixColor('#000000', '#ffffff', 0.5)).toBe('rgb(128, 128, 128)')
  })

  it('ствол тоньше всего у шапки, толще всего у пятиугольника; отвод ниже — толще', () => {
    const { pieces, dots } = ladderWireSet({ hero, blocks, fin, edge: -22 })
    const widths = pieces.map(p => p.w)
    expect(Math.min(...widths)).toBeCloseTo(W_MIN, 0)
    expect(Math.max(...widths)).toBeCloseTo(W_MAX, 0)
    const at = y => pieces.find(p => p.x1 === p.x2 && p.x1 === -11 && p.y1 <= y && p.y2 >= y).w
    expect(at(240)).toBeGreaterThan(at(150))
    // точки: начало у шапки + концы трёх ступеней + начало и конец связи в пятиугольник
    expect(dots).toHaveLength(6)
    expect(dots[2].r).toBeGreaterThanOrEqual(dots[1].r)
  })

  it('шарик: старт на 115% толщины линии у ступени и сжатие вместе с линией до шапки', () => {
    const { widths } = ladderWireSet({ hero, blocks, fin, edge: -22 })
    expect(widths).toHaveLength(3)
    // чем ниже ступень, тем толще линия у неё, а значит и крупнее шарик на старте
    expect(widths[0]).toBeLessThan(widths[1])
    expect(widths[1]).toBeLessThan(widths[2])
    // диаметр шарика = 115% толщины
    expect(ballScale(3.2) * BALL_D).toBeCloseTo(3.2 * BALL_GROW, 2)
    // к шапке линия тоньше — шарик меньше, чем на старте
    widths.forEach(w => expect(ballScale(W_MIN)).toBeLessThan(ballScale(w)))
    // ореол — заметно шире линии (иначе шарик одного цвета с тонкой линией не виден) и тоже сжимается
    expect(haloScale(3.2) * HALO_D).toBeCloseTo(3.2 * HALO_GROW, 2)
    expect(HALO_GROW).toBeGreaterThan(BALL_GROW * 2)
    widths.forEach(w => expect(haloScale(W_MIN)).toBeLessThan(haloScale(w)))
  })
})
