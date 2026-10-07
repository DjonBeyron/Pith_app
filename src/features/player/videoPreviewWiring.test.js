import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// Диагностика проводки превью: что именно попадает в <video> у каждого
// медиамодуля и в какой момент. Тест ничего не чинит — он фиксирует
// проверяемые факты из живого кода, чтобы выводы не строились на догадках.

const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')

const VIDEO   = read('./modules/video/VideoModule.jsx')
// Полноэкранный просмотр (портал) — вынесен из VideoModule.jsx
const VIDEO_FS = read('./modules/video/useVideoFullscreen.jsx')
const CIRCLE  = read('./modules/circle/CircleModule.jsx')
const STICKER = read('./modules/sticker/StickerModule.jsx')
// Прогрев — три файла подряд: usePlayerPreload.js + preloadFetchOne.js (загрузка файла, постер) + preloadEvict.js (вытеснение)
const PRELOAD = read('./usePlayerPreload.js') + read('./preloadFetchOne.js') + read('./preloadEvict.js')
// Склейка файлов с прогревом (withBlobs) — в usePlayerFiles.js, плеер её зовёт
const PLAYER  = read('./LessonPlayer.jsx') + read('./usePlayerFiles.js')
// Разметка сообщений ленты живёт отдельно от оркестратора (вынесена из
// LessonPlayer.jsx, когда тот упёрся в потолок размера файла)
const FEED_NODES = read('./PlayerFeedNodes.jsx')
const GRAPH   = read('./useGraphPlayer.js')

// Все <video …/> в файле как отдельные куски текста
function videoTags(src) {
  return src.match(/<video[\s\S]*?\/>/g) ?? []
}

describe('какие модули отдают постер в <video>', () => {
  it('кружок: постер из предзагрузки — своя <img> с геометрией видео, а не UA-poster', () => {
    const tags = videoTags(CIRCLE).filter(t => t.includes('circleMedia'))
    expect(tags.length).toBe(1)
    // UA-постер iOS рисуется не как само видео (object-fit/размер до
    // loadedmetadata) — кадр «прыгал» при смене на видео
    expect(tags[0]).not.toContain('poster=')
    expect(CIRCLE).toContain('const poster = file?.posterUrl')
    expect(CIRCLE).toContain('<img src={poster}')
    expect(CIRCLE).toContain('style={{ ...posterStyle, ...VIDEO_GUARD_STYLE }}')
    // стоп-кадр уходит только когда видео показало первый кадр
    expect(CIRCLE).toContain('const framed = useFirstFrame(vRef, src)')
    expect(CIRCLE).toContain('!!poster && (mirror ? mirrorSrc !== src : !framed)')
  })

  it('кружок на Android: скелетон держится, пока зеркало не нарисовало настоящий кадр', () => {
    expect(CIRCLE).toContain('!(mirror ? mirrorSrc === src : loadedSrc)')
    expect(CIRCLE).toContain('useVideoMirror(vRef, mirrorRef, mirror && !!src, null, () => setMirrorSrc(src))')
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
    // кружок: <img> с posterStyle (кроп ноды), а не CSS-фон без кропа
    expect(CIRCLE).toContain('<img src={poster}')
    expect(CIRCLE).not.toContain('backgroundImage')
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

  it('запас времени на предрисовку — ровно задержка «печатает» (кроме реакций)', () => {
    const delay = Number(GRAPH.match(/const TYPING_DELAY_MS = (\d+)/)?.[1])
    expect(delay).toBeGreaterThan(0)
    expect(GRAPH).toContain('setPendingNode(next)')
    // показ ноды отложен на задержку «печатает…» (шаг «вперёд» админа
    // раскрывает её раньше — это отдельная ветка revealNode). Исключение —
    // reaction: она прилипает к уже показанному пузырю, а не открывает
    // новое сообщение, и получает свою короткую паузу REACTION_DELAY_MS,
    // без индикатора «печатает…» (см. useGraphPlayer.js)
    // delayMs — своя длина точек (старт урока, FIRST_TYPING_MS), иначе обычная
    expect(GRAPH).toContain('const delay = delayMs ?? (isReaction ? REACTION_DELAY_MS : TYPING_DELAY_MS)')
    // После задержки показ ждёт прогрева файлов ноды (preloadWarm.js), но не
    // дольше WARM_MAX_MS — «печатает» не может висеть бесконечно на слабой сети
    expect(GRAPH).toContain('addTimer(() => tryReveal(Date.now() + WARM_MAX_MS, false), delay)')
    expect(GRAPH).toContain('if ((!warm && Date.now() < deadline) || held)')
    console.log(`[preRenderBudget] на декодирование до показа: ${delay} мс (+ до WARM_MAX_MS ожидания прогрева)`)
  })

  // Раньше первая нода клалась в ленту прямо при инициализации — без
  // предрисовки, без въезда и без звука. Теперь она идёт тем же путём, что и
  // остальные (scheduleReveal: pending за экраном → точки → показ), только
  // точки короче — FIRST_TYPING_MS, см. playerStartTyping.test.js
  it('первая нода урока тоже предрисовывается — на время FIRST_TYPING_MS', () => {
    const first = Number(GRAPH.match(/export const FIRST_TYPING_MS = (\d+)/)?.[1])
    expect(first).toBeGreaterThan(0)
    const init = GRAPH.slice(GRAPH.indexOf('const entry = findEntry'))
    expect(init).toContain('setVisibleNodes(initialPage)')
    expect(init).not.toContain('setVisibleNodes([...initialPage, entry])')
    expect(init).toContain('scheduleReveal.current(entry.id, !firstTyping, FIRST_TYPING_MS)')
    console.log(`[preRenderBudget] первая нода: ${first} мс точек на декодирование`)
  })

  it('инлайновое видео грузится с preload="auto" и без своей заглушки', () => {
    const inline = videoTags(VIDEO).find(t => t.includes('playerVideoMedia'))
    expect(inline).toContain('preload="auto"')
    expect(inline).not.toContain('poster')
    // frame0 снимается уже ИЗ этого элемента и только для полноэкранного слоя
    expect(VIDEO).toContain('onLoadedData')
    expect(VIDEO_FS).toContain('{fsVisible && frame0 && !fsReady && (')
  })
})
