// Подмена curriculaApi.js для стенда «лента рекомендаций» (feed-media.spec.js): dev-сервер стенда поднят с PITHY_BENCH_STUBS=1,
// и vite.config.js подставляет этот файл вместо настоящего. Всё, кроме loadCurricula, — настоящее (запросы к мёртвому
// Supabase падают по плану); loadCurricula отдаёт шесть синтетических модулей с видео/постерами с медиа-сервера (?media=).
// «?real» в пути — чтобы подстановка не сработала на сам настоящий файл
export * from '/src/shared/lib/curriculaApi.js?real'

export const FEED_BENCH_COUNT = 6
const base = typeof location !== 'undefined' ? (new URLSearchParams(location.search).get('media') ?? '') : ''

export async function loadCurricula() {
  return Array.from({ length: FEED_BENCH_COUNT }, (_, i) => ({
    id: `bench-${i + 1}`,
    title: `Bench phrase number ${i + 1}`,
    title_translation: `Фраза стенда ${i + 1}`,
    word_translations: [],
    lesson_ids: [],
    video_url: `${base}/v${i + 1}.webm`,
    poster_url: `${base}/p${i + 1}.jpg`,
    published: true,
    preview_only: false,
    created_at: new Date(Date.now() - i * 60_000).toISOString(),
    difficulty: null,
  }))
}
