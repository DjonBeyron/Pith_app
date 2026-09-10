import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('зонд дрожания ленты', () => {
  const probe = read('./debugJitter.js')

  it('ищет РАЗВОРОТЫ движения, а не само движение', () => {
    // Плавный проезд сообщения — штатное движение, разворотов он не даёт.
    // Дрожь состоит из них одних, поэтому считаем именно смену направления
    expect(probe).toContain('tr.reversals += 1')
    expect(probe).toContain('dir !== tr.dir')
  })

  it('видит дрожь, которой НЕТ в getBoundingClientRect', () => {
    // Дробный translateY без своего слоя заставляет браузер каждый кадр
    // заново класть текст на субпиксельную сетку: буквы плывут, а коробка
    // стоит. По rect такое не поймать вовсе — смотрим на само значение ty
    expect(probe).toContain('function isFractional(ty)')
    expect(probe).toContain('tr.fract += 1')
    expect(probe).toContain('плывётТекст')
  })

  it('отличает анимацию высоты от анимации трансформа — это разные причины', () => {
    // height двигает разметку (PlayerBubble по ResizeObserver),
    // transform — нет (FLIP в PlayerFeed). Диагноз у них разный
    expect(probe).toContain("keys.has('height')")
    expect(probe).toContain("keys.has('transform')")
  })

  it('выдаёт диагноз, а не только цифры', () => {
    const verdict = probe.slice(probe.indexOf('function verdict'))
    expect(verdict).toContain('PlayerFeed')
    expect(verdict).toContain('PlayerBubble')
    expect(probe).toContain('вывод:')
  })

  it('сводка уезжает в отчёт дебага', () => {
    expect(probe).toContain('export function getJitterReport()')
    expect(read('./debugReport.js')).toContain('дрожание: getJitterReport()')
  })
})

describe('трассировка звука', () => {
  const trace = read('../../shared/lib/soundTrace.js')

  it('не верит промису play() — он резолвится в момент старта', () => {
    // «OK» означает лишь, что воспроизведение началось: дальше звук мог
    // встать на паузу или оборваться, и ученик его не услышал бы
    expect(trace).toContain("addEventListener('playing'")
    expect(trace).toContain("addEventListener('ended'")
    expect(trace).toContain("addEventListener('pause'")
  })

  it('не клеймит доигравший звук «оборванным» — pause приходит РАНЬШЕ ended', () => {
    // Проверено в Chrome на файле длиной 1.71с: pause@1.71 → ended@1.71.
    // Без этой проверки каждый нормальный звук попадал бы в отчёт как обрыв,
    // и отладка гонялась бы за призраком
    const onPause = trace.slice(trace.indexOf('const onPause'))
    const body = onPause.slice(0, onPause.indexOf('const cleanup'))
    expect(body).toContain('if (audio.ended) return')
    // Решение откладывается на такт — ended приходит следом
    expect(body).toMatch(/setTimeout\(\(\) => \{[\s\S]*audio\.ended[\s\S]*\}, 0\)/)
  })

  it('ловит перезапуск поверх ещё звучащего — так звук «съедается»', () => {
    expect(trace).toContain('перезапуск: audio ? !audio.paused : false')
  })

  it('в отчёте видно, КТО просил звук', () => {
    const sounds = read('../../shared/lib/sounds.js')
    expect(sounds).toContain('export function playSound(name, where = null)')
    expect(sounds).toContain('откуда: where')
    expect(read('./debugReport.js')).toContain('звук: getSoundLog()')
  })
})

describe('салют у авто-таблицы', () => {
  it('у авто-таблицы залпа нет — фразу собирает таймлайн, не ученик', () => {
    const dictator = read('../player/panels/table-dictator/TableDictatorPanel.jsx')
    expect(dictator).not.toContain('BurstConfetti')
  })

  it('у ручной таблицы залп остался — там ответ собирает ученик', () => {
    expect(read('../player/panels/table-manual/TableManualPanel.jsx')).toContain('<BurstConfetti')
  })

  it('второго источника залпа у таблиц нет', () => {
    // AnswerBubbles рисует пузыри обеим таблицам и салют не даёт ни одной
    expect(read('../player/modules/table/TableModule.jsx')).toContain('confetti={false}')
  })
})
