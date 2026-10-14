import { audioHash, voiceSpec, lineAudioState } from '../../../scene/v2/sceneVoice.js'
import { sumChars } from './voicePresets.js'

// Планировщик «Озвучить всё» — чистые функции без сети и React. План: какие реплики
// генерировать (нет файла / устарели), какие взять из кэша по hash (та же фраза тем же
// голосом уже озвучена в другой реплике этой сцены), сколько символов уйдёт в квоту.
// Запуск — runVoicePlan: строго последовательно (лимиты API ElevenLabs), ошибка одной
// реплики не обрывает остальные, остановка — между репликами.

// → { items: [{ index, text, hash, who, reuseFrom: индекс реплики с готовым файлом | null }],
//     generate: число реальных вызовов TTS, chars: символов в квоту, ready: уже актуальных }
export function planVoiceAll(scene) {
  const tl = Array.isArray(scene?.timeline) ? scene.timeline : []
  const chars = scene?.characters ?? {}
  // Готовые файлы по hash — источник для кэша
  const readyByHash = new Map()
  tl.forEach((l, i) => {
    if (lineAudioState(l, chars[l?.who]) === 'ready' && l.audioMeta?.hash && !readyByHash.has(l.audioMeta.hash)) readyByHash.set(l.audioMeta.hash, i)
  })
  const items = []
  const firstInPlan = new Map() // hash → индекс первой реплики плана, которая его сгенерирует
  tl.forEach((l, i) => {
    const text = String(l?.text ?? '').trim()
    if (!text) return
    const state = lineAudioState(l, chars[l?.who])
    if (state === 'ready') return
    const hash = audioHash(text, voiceSpec(chars[l?.who]))
    let reuseFrom = readyByHash.has(hash) ? readyByHash.get(hash) : null
    if (reuseFrom === null && firstInPlan.has(hash)) reuseFrom = firstInPlan.get(hash)
    if (reuseFrom === null) firstInPlan.set(hash, i)
    items.push({ index: i, text, hash, who: l.who, reuseFrom })
  })
  const toGenerate = items.filter(x => x.reuseFrom === null)
  return {
    items,
    generate: toGenerate.length,
    chars: sumChars(toGenerate.map(x => x.text)),
    ready: tl.length - items.length,
    total: tl.length,
  }
}

// Хватит ли квоты: remaining null — неизвестно (функция квоты недоступна)
export function quotaVerdict(plan, quota) {
  if (!quota || typeof quota.limit !== 'number') return { known: false, remaining: null, enough: null }
  const remaining = Math.max(0, quota.limit - (quota.used ?? 0))
  return { known: true, remaining, enough: remaining >= plan.chars }
}

// Последовательный прогон плана.
//   generate(item) → patch { audioUrl, wordTimings, audioMeta } (бросает при ошибке)
//   apply(index, patch) — положить результат в сцену
//   reusePatch(index) → patch готовой реплики сцены (кэш по hash, см. patchFromLine)
//   onProgress({ done, total, index, ok, error? }) — после каждой реплики
//   isStopped() → true — остановиться перед следующей репликой
// Возвращает { ok: [индексы], failed: [{ index, error }], stopped, skipped: [индексы] }
export async function runVoicePlan(plan, { generate, apply, reusePatch = null, onProgress = () => {}, isStopped = () => false }) {
  const result = { ok: [], failed: [], stopped: false, skipped: [] }
  const done = new Map() // hash → patch (для переиспользования внутри прогона)
  for (let k = 0; k < plan.items.length; k++) {
    const item = plan.items[k]
    if (isStopped()) { result.stopped = true; result.skipped = plan.items.slice(k).map(x => x.index); break }
    try {
      let patch = done.get(item.hash)
      if (!patch && item.reuseFrom !== null && reusePatch) patch = reusePatch(item.reuseFrom)
      if (!patch) patch = await generate(item)
      if (!patch?.audioUrl) throw new Error('пустой результат генерации')
      done.set(item.hash, patch)
      apply(item.index, patch)
      result.ok.push(item.index)
      onProgress({ done: k + 1, total: plan.items.length, index: item.index, ok: true })
    } catch (e) {
      const error = e?.message || String(e)
      result.failed.push({ index: item.index, error })
      onProgress({ done: k + 1, total: plan.items.length, index: item.index, ok: false, error })
    }
  }
  return result
}

// Готовый patch из реплики сцены (кэш по hash для reuseFrom)
export function patchFromLine(line) {
  if (!line?.audioUrl) return null
  const patch = { audioUrl: line.audioUrl }
  if (line.wordTimings) patch.wordTimings = line.wordTimings
  if (line.audioMeta) patch.audioMeta = line.audioMeta
  return patch
}
