import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// Диагностика проводки превью: что именно попадает в <video> у каждого
// медиамодуля и в какой момент. Тест ничего не чинит — он фиксирует
// проверяемые факты из живого кода, чтобы выводы не строились на догадках.

const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')

const VIDEO   = read('./modules/video/VideoModule.jsx')
const CIRCLE  = read('./modules/circle/CircleModule.jsx')
const STICKER = read('./modules/sticker/StickerModule.jsx')
const PRELOAD = read('./usePlayerPreload.js')
const PLAYER  = read('./LessonPlayer.jsx')
// Разметка сообщений ленты живёт отдельно от оркестратора (вынесена из
// LessonPlayer.jsx, когда тот упёрся в потолок размера файла)
const FEED_NODES = read('./PlayerFeedNodes.jsx')
const GRAPH   = read('./useGraphPlayer.js')

// Все <video …/> в файле как отдельные куски текста
function videoTags(src) {
  return src.match(/<video[\s\S]*?\/>/g) ?? []
}

describe('какие модули отдают постер в <video>', () => {
  it('кружок: постер из предзагрузки подставлен', () => {
    const tags = videoTags(CIRCLE).filter(t => t.includes('circleMedia'))
    expect(tags.length).toBe(1)
    expect(tags[0]).toContain('poster={poster}')
    expect(CIRCLE).toContain('const poster = file?.posterUrl')
  })

  it('стикер: постер из предзагрузки подставлен', () => {
    const tags = videoTags(STICKER).filter(t => t.includes('poster='))
    expect(tags.length).toBe(1)
    expect(STICKER).toContain('const poster  = file?.posterUrl')
  })

  it('видео: ни один <video> не получает poster', () => {
    const tags = videoTags(VIDEO)
    expect(tags.length).toBeGreaterThan(0)
    for (const t of tags) expect(t, t.slice(0, 60)).not.toContain('poster=')
    // и сам posterUrl в модуле не читается вообще
    expect(VIDEO).not.toContain('posterUrl')
  })

  it('у видео нет и запасной картинки под элементом — в отличие от кружка', () => {
    expect(CIRCLE).toContain('backgroundImage: `url(${poster})`')
    expect(VIDEO).not.toContain('backgroundImage')
  })

  it('плеер при этом посылает posterUrl всем модулям одинаково', () => {
    expect(PLAYER).toContain('posterUrl: entry.posterUrl ?? null')
  })

  it('предзагрузка тратит захват кадра и на video тоже', () => {
    const line = PRELOAD.match(/const POSTER_TYPES\s*=\s*new Set\(\[(.*?)\]\)/)?.[1] ?? ''
    expect(line).toContain("'video'")
    expect(line).toContain("'circle'")
    expect(line).toContain("'sticker'")
  })
})

describe('когда постер вообще появляется относительно показа файла', () => {
  it('блоб публикуется раньше захвата кадра', () => {
    const publish = PRELOAD.indexOf('setBlobMap(prev => ({ ...prev, [id]: { blobUrl, posterUrl: null } }))')
    const capture = PRELOAD.indexOf('enqueuePosterCapture(blobUrl')
    expect(publish).toBeGreaterThan(-1)
    expect(capture).toBeGreaterThan(publish)
  })

  it('готовность ноды не ждёт постера — это заявлено прямо в коде', () => {
    const ready  = PRELOAD.indexOf('if (checkNodeReady(nodeId))')
    const capture = PRELOAD.indexOf('enqueuePosterCapture(blobUrl')
    expect(ready).toBeGreaterThan(-1)
    expect(capture).toBeGreaterThan(ready)
    expect(PRELOAD).toContain('Poster capture must NOT gate')
  })

  it('захват кадра стоит в общей однопоточной очереди', () => {
    const QUEUE = read('./posterQueue.js')
    expect(QUEUE).toContain('let chain = Promise.resolve()')
    expect(QUEUE).toContain('chain = chain')
    // очередь одна на весь модуль — общая для всех роликов урока
    expect(QUEUE.match(/let chain/g).length).toBe(1)
  })

  it('вытеснение файла тоже уходит захватывать кадр — в том же потоке', () => {
    expect(PRELOAD).toContain('posterUrl = await capturePosterFrame(entry.blobUrl, 2000)')
    const evict = PRELOAD.indexOf('await evictFarthestIfNeeded(gen, id)')
    const capture = PRELOAD.indexOf('enqueuePosterCapture(blobUrl')
    expect(evict).toBeGreaterThan(-1)
    expect(capture).toBeGreaterThan(evict)
  })
})

describe('сколько времени у элемента есть на декодирование до показа', () => {
  it('нода предрисовывается заранее, но скрыто и за экраном', () => {
    expect(FEED_NODES).toContain("data-pending={isPending ? 'true' : undefined}")
    expect(FEED_NODES).toContain("visibility: 'hidden'")
    expect(FEED_NODES).toContain("bottom: '-100vh'")
  })

  it('запас времени на предрисовку — ровно задержка «печатает»', () => {
    const delay = Number(GRAPH.match(/const TYPING_DELAY_MS = (\d+)/)?.[1])
    expect(delay).toBeGreaterThan(0)
    expect(GRAPH).toContain('setPendingNode(next)')
    // показ ноды отложен ровно на задержку «печатает…» (шаг «вперёд» админа
    // раскрывает её раньше — это отдельная ветка revealNode)
    expect(GRAPH).toContain('addTimer(() => revealNode(next), TYPING_DELAY_MS)')
    console.log(`[preRenderBudget] на декодирование до показа: ${delay} мс`)
  })

  it('первая нода урока показывается без предрисовки вообще', () => {
    const init = GRAPH.slice(GRAPH.indexOf('const entry = findEntry'))
    expect(init).toContain('setVisibleNodes([entry])')
    expect(init).not.toContain('setPendingNode(entry)')
  })

  it('инлайновое видео грузится с preload="auto" и без своей заглушки', () => {
    const inline = videoTags(VIDEO).find(t => t.includes('playerVideoMedia'))
    expect(inline).toContain('preload="auto"')
    expect(inline).not.toContain('poster')
    // frame0 снимается уже ИЗ этого элемента и только для полноэкранного слоя
    expect(VIDEO).toContain('onLoadedData')
    expect(VIDEO).toContain('{fsVisible && frame0 && !fsReady && (')
  })
})
