import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { capturePosterFrame } from '../../shared/lib/videoFrame.js'
import { enqueuePosterCapture } from './posterQueue.js'
import { installFakeDom, PLANS, rng } from './posterTestDom.js'

// Диагностика: как ведёт себя НАСТОЯЩИЙ конвейер постеров (posterQueue.js +
// videoFrame.js) под разными декодерами. Ничего не чиним — только измеряем,
// и не на одном прогоне, а на сотнях со случайными сочетаниями задержек.

// Таймаут берём из самого posterQueue.js, чтобы тест не разошёлся с кодом
const QUEUE_SRC = readFileSync(new URL('./posterQueue.js', import.meta.url), 'utf8')
const TIMEOUT_MS = Number(QUEUE_SRC.match(/capturePosterFrame\(blobUrl,\s*(\d+)\)/)?.[1])

let dom = null

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { dom?.restore(); dom = null; vi.useRealTimers() })

async function drain(ms) { await vi.advanceTimersByTimeAsync(ms) }

// Один прогон очереди: планы декодера → массив {i, at, url}
async function runQueue(plans, budgetMs) {
  dom = installFakeDom()
  const t0 = Date.now()
  const done = []
  plans.forEach((plan, i) => {
    dom.push(plan)
    enqueuePosterCapture(`blob:v${i}`, url => done.push({ i, at: Date.now() - t0, url }))
  })
  await drain(budgetMs)
  return done
}

describe('capturePosterFrame — исходы одного захвата', () => {
  it('быстрый декодер отдаёт кадр', async () => {
    dom = installFakeDom([PLANS.fast(40)])
    const p = capturePosterFrame('blob:v', TIMEOUT_MS)
    await drain(60)
    expect(await p).toMatch(/^blob:poster-/)
  })

  it('без известных размеров код перематывает и ждёт seeked', async () => {
    dom = installFakeDom([PLANS.seek(60, 200)])
    const p = capturePosterFrame('blob:v', TIMEOUT_MS)
    await drain(300)
    expect(await p).toMatch(/^blob:poster-/)
    expect(dom.created[0].seeks).toBe(1)
  })

  it('молчащий декодер отдаёт null только по таймауту', async () => {
    dom = installFakeDom([PLANS.hang()])
    const p = capturePosterFrame('blob:v', TIMEOUT_MS)
    await drain(TIMEOUT_MS - 1)
    let settled = false
    p.then(() => { settled = true })
    await drain(0)
    expect(settled, 'до таймаута промис не завершается').toBe(false)
    await drain(2)
    expect(await p).toBeNull()
  })

  it('битый файл отдаёт null сразу', async () => {
    dom = installFakeDom([PLANS.error(30)])
    const p = capturePosterFrame('blob:v', TIMEOUT_MS)
    await drain(50)
    expect(await p).toBeNull()
  })
})

describe('posterQueue — очередь строго последовательная (200 прогонов)', () => {
  it('k-й постер готов не раньше суммы всех предыдущих захватов', async () => {
    const RUNS = 200
    const overshoot = []
    for (let seed = 1; seed <= RUNS; seed++) {
      const rand = rng(seed)
      const n = 3 + Math.floor(rand() * 6)               // 3..8 роликов
      const d = Array.from({ length: n }, () => 30 + Math.floor(rand() * 470))
      const sum = d.reduce((a, b) => a + b, 0)
      const done = await runQueue(d.map(ms => PLANS.fast(ms)), sum + 200)
      expect(done.length, `сид ${seed}`).toBe(n)
      let acc = 0
      done.forEach((item, k) => {
        acc += d[k]
        expect(item.i, `сид ${seed}: порядок`).toBe(k)
        expect(item.at, `сид ${seed}: постер №${k}`).toBeGreaterThanOrEqual(acc)
      })
      overshoot.push(done[n - 1].at - sum)
      dom.restore(); dom = null
    }
    // Параллелизма нет вовсе: последний постер приходит ровно через сумму
    const maxOver = Math.max(...overshoot)
    expect(maxOver, 'очередь не совмещает захваты').toBeLessThanOrEqual(5)
  })
})

describe('posterQueue — один зависший ролик тормозит все следующие (120 прогонов)', () => {
  it('после зависшего захвата постеры сдвигаются на полный таймаут', async () => {
    const RUNS = 120
    const shifts = []
    for (let seed = 1; seed <= RUNS; seed++) {
      const rand = rng(1000 + seed)
      const n = 4 + Math.floor(rand() * 4)               // 4..7 роликов
      const d = Array.from({ length: n }, () => 40 + Math.floor(rand() * 260))
      const bad = 1 + Math.floor(rand() * (n - 2))       // не первый и не последний

      const plansOk = d.map(ms => PLANS.fast(ms))
      const base = await runQueue(plansOk, d.reduce((a, b) => a + b, 0) + 200)
      dom.restore(); dom = null

      const plansBad = d.map((ms, i) => (i === bad ? PLANS.hang() : PLANS.fast(ms)))
      const hurt = await runQueue(plansBad, d.reduce((a, b) => a + b, 0) + TIMEOUT_MS + 200)
      dom.restore(); dom = null

      expect(hurt.length, `сид ${seed}`).toBe(n)
      expect(hurt[bad].url, 'зависший ролик остаётся без постера').toBeNull()
      // Все, кто стоял в очереди позже, ждут таймаут чужого файла
      for (let k = bad + 1; k < n; k++) {
        shifts.push(hurt[k].at - base[k].at)
      }
    }
    const median = shifts.slice().sort((a, b) => a - b)[Math.floor(shifts.length / 2)]
    expect(Math.min(...shifts), 'сдвиг есть в каждом прогоне').toBeGreaterThan(0)
    expect(median, 'сдвиг равен таймауту захвата').toBeGreaterThanOrEqual(TIMEOUT_MS - 300)
    console.log(`[posterHeadOfLine] медианный сдвиг после зависшего ролика: ${median} мс`)
  })
})

describe('posterQueue — смешанные декодеры (150 прогонов)', () => {
  it('доля роликов без постера равна доле «плохих» файлов, очередь не рвётся', async () => {
    const RUNS = 150
    let items = 0, nulls = 0, bad = 0
    for (let seed = 1; seed <= RUNS; seed++) {
      const rand = rng(5000 + seed)
      const n = 4 + Math.floor(rand() * 5)
      const plans = []
      let budget = 300
      for (let i = 0; i < n; i++) {
        const r = rand()
        if (r < 0.15) { plans.push(PLANS.hang()); budget += TIMEOUT_MS; bad++ }
        else if (r < 0.3) { plans.push(PLANS.error(30)); budget += 60; bad++ }
        else if (r < 0.6) { plans.push(PLANS.seek(60, 250)); budget += 350 }
        else { plans.push(PLANS.fast(80)); budget += 120 }
      }
      const done = await runQueue(plans, budget)
      dom.restore(); dom = null
      expect(done.length, `сид ${seed}: очередь дошла до конца`).toBe(n)
      items += n
      nulls += done.filter(x => x.url === null).length
    }
    expect(nulls).toBe(bad)
    // Печатаем факт, а не мнение: сколько роликов вообще осталось без постера
    console.log(`[postersMissing] ${nulls}/${items} = ${(nulls / items * 100).toFixed(1)}%`)
  })
})
