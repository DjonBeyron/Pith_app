import { LADDER_WATCHED_MS } from './ladderRules.js'

// Сборщик итогов лесенки (чистый, без подписок и хранилища): получает события журнала (feed_view, feed_reveal,
// feed_phrase_open, feed_slow) и копит по каждой фразе плана «сколько смотрел» и «были ли признаки трудности».
// plan — [{ id, difficulty }] в порядке показа.
//   handle(name, props) → итог, когда просмотрена последняя фраза плана (все фразы плана видели хотя бы раз), иначе null;
//   flush()             → итог по тому, что успели (страница уходит); null, если нет ни одного просмотра или итог уже отдан.
// Итог: { count, steps, top, hard } — готовые props события feed_ladder (плоские, без id модулей):
//   steps — «сложность:мс:трудно» по просмотренным фразам плана через запятую, например «1:9100:0,2:1500:1»;
//   top   — наибольшая сложность, на которой не было признаков трудности и просмотр ≥ 8 с (0 — нет такой);
//   hard  — самая лёгкая сложность с признаками трудности выше top (0 — нет). Трудность на сложности не выше top —
//           шум (человек потёр перевод у лёгкой, но спокойно досмотрел сложную), её не считаем.
// Фраза, на которую вернулись (свайп назад) или которую сворачивали, копит время суммой; признак трудности «залипает».
export function createCollector(plan) {
  const steps = new Map(plan.map(s => [s.id, { difficulty: s.difficulty, ms: 0, seen: false, hard: false }]))
  let sent = false

  function summarize() {
    const seen = plan.map(s => steps.get(s.id)).filter(s => s.seen)
    const calm = seen.filter(s => !s.hard && s.ms >= LADDER_WATCHED_MS)
    const top = calm.reduce((max, s) => Math.max(max, s.difficulty), 0)
    const hard = seen.filter(s => s.hard && s.difficulty > top).reduce((min, s) => Math.min(min, s.difficulty), 4)
    return {
      count: seen.length,
      steps: seen.map(s => `${s.difficulty}:${Math.round(s.ms)}:${s.hard ? 1 : 0}`).join(','),
      top,
      hard: hard === 4 ? 0 : hard,
    }
  }

  return {
    handle(name, props) {
      if (sent) return null
      const step = steps.get(props?.module_id)
      if (!step) return null
      if (name === 'feed_view') {
        const ms = Number(props.ms)
        if (Number.isFinite(ms) && ms > 0) step.ms += ms
        step.seen = true
        if (![...steps.values()].every(s => s.seen)) return null
        sent = true
        return summarize()
      }
      if (name === 'feed_reveal' || name === 'feed_phrase_open' || (name === 'feed_slow' && props.on === true)) step.hard = true
      return null
    },
    flush() {
      if (sent) return null
      sent = true
      const sum = summarize()
      return sum.count ? sum : null
    },
  }
}
