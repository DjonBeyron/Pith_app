import { describe, it, expect } from 'vitest'
import { catVisLine } from './useCatVisLog.js'

const cat = ({ vis = '', up = true } = {}) => ({ style: { visibility: vis }, dataset: { dodge: 'dive-up' }, classList: { contains: c => c === 'wlCat--up' && up },
  getBoundingClientRect: () => ({ top: 600, left: 90, width: 188, bottom: 759 }), querySelector: () => null })
const root = (c, paused = false) => ({ querySelector: s => (s === '.wlCat' ? c : null), hasAttribute: a => a === 'data-paused' && paused })
const cs = () => ({ opacity: '1', visibility: 'visible' })

describe('[cat-vis]: диагностика «Пит пропадает»', () => {
  it('узла нет — так и пишет', () => { expect(catVisLine(root(null), 'sprint')).toContain('узла Пита нет') })
  it('Пит на экране: opacity, visibility, где он', () => {
    const s = catVisLine(root(cat()), 'sprint', cs)
    expect(s).toContain('стадия sprint'); expect(s).toContain('opacity 1/—'); expect(s).toContain('visibility visible'); expect(s).toContain('на экране'); expect(s).toContain('поднят'); expect(s).toContain('пауза нет')
  })
  it('под коробкой Мии помечено отдельно', () => { expect(catVisLine(root(cat({ vis: 'hidden' })), 'boss', () => ({ opacity: '1', visibility: 'hidden' }))).toContain('под коробкой Мии') })
})
