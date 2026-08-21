import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { rng } from './posterTestDom.js'

// Модель времени: успевает ли постер-кадр появиться раньше, чем сообщение
// прилетит в чат. Правила взяты из живого кода (константы читаются из файлов),
// а неизвестные величины — скорость сети и скорость декодера — перебираются
// сеткой, по 150 случайных прогонов в каждой ячейке. Вывод строится на всей
// сетке, а не на одном удобном прогоне.

const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
const PRELOAD = read('./usePlayerPreload.js')
const GRAPH   = read('./useGraphPlayer.js')

const CONCURRENCY = Number(PRELOAD.match(/const CONCURRENCY\s*=\s*(\d+)/)[1])
const TYPING_MS   = Number(GRAPH.match(/const TYPING_DELAY_MS = (\d+)/)[1])

const RUNS = 150
const BANDS   = [150, 600, 2000]        // КБ/с: слабый 3G, обычный 4G, wi-fi
const DECODES = [150, 400, 900]         // мс на захват кадра: быстрый/средний/медленный телефон
const MODES   = [false, true]           // false — качаем по ходу, true — всё прогрето до старта

// Один сценарий урока: цепочка медианод, каждая играет и отпускает следующую
function simulate({ sizes, decodes, durations, bandKbps, warm }) {
  const n = sizes.length
  const dlDone = new Array(n).fill(0)
  if (!warm) {
    const slots = new Array(CONCURRENCY).fill(0)
    for (let i = 0; i < n; i++) {
      const free = Math.min(...slots)
      const end  = free + (sizes[i] / bandKbps) * 1000
      slots[slots.indexOf(free)] = end
      dlDone[i] = end
    }
  }

  // Как сейчас: захваты кадров идут строго по одному на весь урок
  const posterSerial = []
  let chain = 0
  for (let i = 0; i < n; i++) {
    chain = Math.max(chain, dlDone[i]) + decodes[i]
    posterSerial[i] = chain
  }
  // Гипотетика для сравнения: если бы каждый кадр снимался сразу после скачивания
  const posterParallel = dlDone.map((t, i) => t + decodes[i])

  // Показ: первая нода появляется сразу, каждая следующая — после проигрывания
  // предыдущей плюс задержка «печатает»
  const reveal = []
  let t = 0
  for (let i = 0; i < n; i++) { reveal[i] = t; t += durations[i] + TYPING_MS }

  // tail — всё, кроме самой первой ноды: она показывается в t=0 и постера не
  // имеет никогда, поэтому её отделяем, чтобы она не красила общую картину
  let lateSerial = 0, lateParallel = 0, lateBytes = 0, tailSerial = 0, tailBytes = 0
  for (let i = 0; i < n; i++) {
    if (posterSerial[i]   > reveal[i]) { lateSerial++; if (i) tailSerial++ }
    if (posterParallel[i] > reveal[i]) lateParallel++
    if (dlDone[i]         > reveal[i]) { lateBytes++; if (i) tailBytes++ }
  }
  return { n, lateSerial, lateParallel, lateBytes, tailSerial, tailBytes,
    firstLate: posterSerial[0] > reveal[0] }
}

function cell(bandKbps, decodeMs, warm, seedBase) {
  let nodes = 0, serial = 0, parallel = 0, bytes = 0, firstLate = 0
  let tailNodes = 0, tailSerial = 0, tailBytes = 0
  for (let s = 0; s < RUNS; s++) {
    const rand = rng(seedBase + s)
    const n = 4 + Math.floor(rand() * 5)                     // 4..8 медианод подряд
    const sizes     = Array.from({ length: n }, () => 300 + Math.floor(rand() * 2200)) // КБ
    const decodes   = Array.from({ length: n }, () => Math.round(decodeMs * (0.6 + rand() * 0.8)))
    const durations = Array.from({ length: n }, () => 2000 + Math.floor(rand() * 6000))
    const r = simulate({ sizes, decodes, durations, bandKbps, warm })
    nodes += r.n; serial += r.lateSerial; parallel += r.lateParallel; bytes += r.lateBytes
    tailNodes += r.n - 1; tailSerial += r.tailSerial; tailBytes += r.tailBytes
    if (r.firstLate) firstLate++
  }
  return {
    nodes, runs: RUNS,
    serialPct: serial / nodes * 100,
    parallelPct: parallel / nodes * 100,
    bytesPct: bytes / nodes * 100,
    tailSerialPct: tailSerial / tailNodes * 100,
    tailBytesPct: tailBytes / tailNodes * 100,
    firstLatePct: firstLate / RUNS * 100,
  }
}

describe('постер против показа — сетка сценариев, 150 прогонов на ячейку', () => {
  const grid = []
  for (const warm of MODES) {
    for (const band of BANDS) {
      for (const dec of DECODES) {
        // сид зависит только от режима и сети: внутри группы уроки одни и те же,
        // меняется лишь скорость декодера — сравнение ячеек парное
        grid.push({ warm, band, dec, ...cell(band, dec, warm, (warm ? 7e5 : 3e5) + band * 100) })
      }
    }
  }

  it('печатает всю сетку целиком — выводы по таблице, а не по одному прогону', () => {
    const rows = grid.map(g => ({
      режим: g.warm ? 'прогрето' : 'качается',
      'КБ/с': g.band,
      'декод, мс': g.dec,
      'без постера, %': g.serialPct.toFixed(1),
      'без постера если бы параллельно, %': g.parallelPct.toFixed(1),
      'без байтов, %': g.bytesPct.toFixed(1),
      'без постера кроме 1-й ноды, %': g.tailSerialPct.toFixed(1),
      'без байтов кроме 1-й ноды, %': g.tailBytesPct.toFixed(1),
    }))
    console.table(rows)
    expect(grid.length).toBe(MODES.length * BANDS.length * DECODES.length)
    expect(grid.reduce((s, g) => s + g.runs, 0)).toBe(grid.length * RUNS)
  })

  it('первое сообщение урока не успевает получить постер никогда', () => {
    for (const g of grid) {
      expect(g.firstLatePct, `${g.warm ? 'прогрето' : 'качается'} ${g.band}КБ/с ${g.dec}мс`).toBe(100)
    }
  })

  it('прогрев файлов до старта не закрывает вопрос постеров', () => {
    const warmCells = grid.filter(g => g.warm)
    expect(warmCells.every(g => g.bytesPct === 0), 'байты при прогреве всегда на месте').toBe(true)
    // при этом постеры всё равно опаздывают — они снимаются уже после старта
    expect(Math.max(...warmCells.map(g => g.serialPct))).toBeGreaterThan(0)
  })

  it('одна общая очередь захватов — заметная часть опозданий', () => {
    for (const g of grid) {
      expect(g.serialPct, `${g.band}КБ/с ${g.dec}мс`).toBeGreaterThanOrEqual(g.parallelPct)
    }
    const worst = grid.reduce((a, g) => Math.max(a, g.serialPct - g.parallelPct), 0)
    console.log(`[serialQueueCost] максимальная добавка от общей очереди: +${worst.toFixed(1)} п.п.`)
    expect(worst).toBeGreaterThan(0)
  })

  it('чем медленнее декодер, тем больше сообщений без постера', () => {
    for (const warm of MODES) {
      for (const band of BANDS) {
        const line = DECODES.map(dec => grid.find(g => g.warm === warm && g.band === band && g.dec === dec))
        for (let i = 1; i < line.length; i++) {
          expect(line[i].serialPct, `${band}КБ/с ${line[i].dec}мс`).toBeGreaterThanOrEqual(line[i - 1].serialPct - 0.1)
        }
      }
    }
  })

  it('на медленной сети сообщение успевает прийти раньше своих байтов', () => {
    const cold = grid.filter(g => !g.warm && g.band === Math.min(...BANDS))
    expect(Math.max(...cold.map(g => g.tailBytesPct))).toBeGreaterThan(0)
  })

  it('при полном прогреве без постера остаётся только первая нода', () => {
    for (const g of grid.filter(x => x.warm)) {
      expect(g.tailSerialPct, `прогрето ${g.band}КБ/с ${g.dec}мс`).toBe(0)
      expect(g.firstLatePct).toBe(100)
    }
  })
})
