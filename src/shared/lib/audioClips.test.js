import { describe, it, expect } from 'vitest'
import {
  defaultAudioClips, splitAudioClip, moveAudioClip, trimAudioClip, removeAudioClip,
  timelineToFileTime, fileToTimelineTime, audioClipsEnd, MIN_CLIP_S, duplicateAudioClip,
} from './audioClips.js'

const one = () => [{ id: 'a', at: 0, from: 0, len: 10 }]

describe('нарезка озвучки (audioClips)', () => {
  it('свежий файл ложится одним куском с нуля', () => {
    const c = defaultAudioClips(7.5)
    expect(c).toHaveLength(1)
    expect(c[0]).toMatchObject({ at: 0, from: 0, len: 7.5 })
    expect(defaultAudioClips(null)).toEqual([])
  })

  it('разрез по плейхеду — два куска встык, файл продолжается без шва', () => {
    const c = splitAudioClip(one(), 4)
    expect(c).toHaveLength(2)
    expect(c[0]).toMatchObject({ at: 0, from: 0, len: 4 })
    expect(c[1]).toMatchObject({ at: 4, from: 4, len: 6 })
    // время файла в 5.0 читается по-прежнему в 5.0
    expect(timelineToFileTime(c, 5)).toBe(5)
  })

  it('у самого края не режет (огрызок короче MIN_CLIP_S)', () => {
    expect(splitAudioClip(one(), MIN_CLIP_S / 2)).toHaveLength(1)
    expect(splitAudioClip(one(), 20)).toHaveLength(1)   // в тишине резать нечего
  })

  it('сдвиг второго куска даёт тишину между ними — окно ученика', () => {
    const c = splitAudioClip(one(), 4)
    const [, b] = c
    const moved = moveAudioClip(c, b.id, 9, 30)
    expect(moved[1]).toMatchObject({ at: 9, from: 4, len: 6 })
    expect(timelineToFileTime(moved, 6)).toBeNull()      // тишина
    expect(timelineToFileTime(moved, 10)).toBe(5)         // кусок продолжает файл
    expect(fileToTimelineTime(moved, 5)).toBe(10)
    expect(audioClipsEnd(moved)).toBe(15)
  })

  it('сдвиг упирается в соседа и в границы композиции', () => {
    const c = splitAudioClip(one(), 4)
    const [a, b] = c
    // второй кусок влево — не налезает на первый
    expect(moveAudioClip(c, b.id, 1, 30)[1].at).toBe(4)
    // первый вправо — упирается во второй
    expect(moveAudioClip(c, a.id, 3, 30)[0].at).toBe(0)
    // за конец композиции — нет
    expect(moveAudioClip(c, b.id, 100, 30)[1].at).toBe(24)
  })

  it('подрезка: левый край двигает from, правый — только len, дальше файла не тянется', () => {
    const c = one()
    const left = trimAudioClip(c, 'a', 'left', 2, 10)
    expect(left[0]).toMatchObject({ at: 2, from: 2, len: 8 })
    const right = trimAudioClip(c, 'a', 'right', 6, 10)
    expect(right[0]).toMatchObject({ at: 0, from: 0, len: 6 })
    // растянуть обратно за длину файла нельзя
    expect(trimAudioClip(right, 'a', 'right', 50, 10)[0].len).toBe(10)
  })

  it('вырезанный кусок файла не находится на таймлайне', () => {
    const c = removeAudioClip(splitAudioClip(one(), 4), splitAudioClip(one(), 4)[0].id)
    expect(c).toHaveLength(1)
    expect(fileToTimelineTime(c, 2)).toBeNull()
    expect(fileToTimelineTime(c, 6)).toBe(6)
  })
})

describe('дубль куска озвучки', () => {
  it('копия встык, тот же отрезок файла; перед соседом не влезает — за последним; за композицию — подрезка', () => {
    const c = splitAudioClip(one(), 4)          // [0–4 | 4–10]
    const d = duplicateAudioClip(c, c[0].id, 30) // первый не влезает перед вторым → в конец
    expect(d).toHaveLength(3)
    expect(d[2]).toMatchObject({ at: 10, from: 0, len: 4 })
    const e = duplicateAudioClip(d, d[2].id, 16) // встык в 14, но композиция 16 → len 2
    expect(e[3]).toMatchObject({ at: 14, from: 0, len: 2 })
    expect(duplicateAudioClip(e, e[3].id, 16)).toBe(e) // совсем не влезает — без изменений
  })
})
