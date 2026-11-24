import { describe, it, expect } from 'vitest'
import { createListenQueue } from './listenQueue.js'

const fake = () => {
  const made = []
  const make = url => { const a = { url, played: 0, paused: 0, playbackRate: 1, play() { this.played++; this.onplaying?.(); return Promise.resolve() }, pause() { this.paused++ } }; made.push(a); return a }
  return { make, made }
}
const items = [{ key: 'a', url: 'u1' }, { key: 'b', url: 'u2' }, { key: 'c', url: 'u3' }]

describe('очередь прослушивания таймлайна', () => {
  it('клипы идут подряд, без пауз: следующий стартует по окончании прежнего, в конце — done', () => {
    const f = fake(), st = []; const q = createListenQueue({ make: f.make, onState: s => st.push(s) })
    q.start(items); expect(f.made.map(a => a.url)).toEqual(['u1'])
    f.made[0].onended(); f.made[1].onended(); f.made[2].onended()
    expect(f.made.map(a => a.url)).toEqual(['u1', 'u2', 'u3']); expect(st.at(-1)).toMatchObject({ status: 'done' })
    expect(st.filter(s => s.status === 'playing').map(s => s.key)).toEqual(['a', 'b', 'c'])
  })
  it('старт с середины, пауза / дальше / стоп, следующий и предыдущий', () => {
    const f = fake(); const q = createListenQueue({ make: f.make })
    q.start(items, 1); expect(f.made.at(-1).url).toBe('u2')
    q.pause(); expect(q.state().status).toBe('paused'); q.resume(); expect(q.state().status).toBe('playing')
    q.next(); expect(f.made.at(-1).url).toBe('u3'); q.prev(); expect(f.made.at(-1).url).toBe('u2')
    q.stop(); expect(q.state()).toMatchObject({ status: 'idle', index: -1 })
  })
  it('битый файл пропускается и попадает в skipped, очередь идёт дальше; без проигрываемых — idle', () => {
    const f = fake(), st = []; const q = createListenQueue({ make: f.make, onState: s => st.push(s) })
    q.start(items); f.made[0].onerror(); expect(f.made.map(a => a.url)).toEqual(['u1', 'u2']); f.made[1].onended(); f.made[2].onended()
    expect(st.at(-1).skipped).toEqual(['a'])
    q.start([{ key: 'x', url: null }]); expect(q.state().status).toBe('idle')
  })
  it('скорость применяется к текущему и следующим клипам', () => {
    const f = fake(); const q = createListenQueue({ make: f.make }); q.setRate(1.5); q.start(items)
    expect(f.made[0].playbackRate).toBe(1.5); q.setRate(1.25); expect(f.made[0].playbackRate).toBe(1.25)
  })
})
