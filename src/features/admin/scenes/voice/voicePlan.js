import { audioHash, voiceSpec, translationVoiceSpec, lineAudioState, translationAudioState, AUDIO_SETS, audioPartOf } from '../../../scene/v2/sceneVoice.js'
import { sumChars } from './voicePresets.js'

// Планировщик «Озвучить всё» — чистые функции без сети и React. Два НАБОРА озвучки у реплики
// (sceneVoice.AUDIO_SETS): 'original' — text голосом персонажа, 'translation' — translation голосом
// перевода. План: какие реплики каких наборов генерировать (нет файла / устарели), какие взять из
// кэша по hash (та же фраза тем же голосом уже озвучена в ЛЮБОМ наборе любой реплики сцены),
// сколько символов уйдёт в квоту — по наборам и в сумме. Запуск — runVoicePlan: строго
// последовательно (лимиты API ElevenLabs), ошибка одной реплики не обрывает остальные,
// остановка — между репликами. Patch внутри плана — «нейтральный» ({ audioUrl, wordTimings,
// audioMeta }), в поля набора его переводит toSetPatch при apply.

export const SET_LABEL = { original: 'Текст', translation: 'Перевод' }

// Спецификация голоса и статус набора — одна точка для сборщика
export function setSpec(set, character, scene) {
  return set === 'translation' ? translationVoiceSpec(character, scene) : voiceSpec(character)
}
export function setState(set, line, character, scene) {
  return set === 'translation' ? translationAudioState(line, character, scene) : lineAudioState(line, character)
}
export const setText = (set, line) => String(line?.[AUDIO_SETS[set].text] ?? '').trim()

// Нейтральный patch → поля набора (original: как есть)
export function toSetPatch(patch, set = 'original') {
  if (set === 'original' || !patch) return patch
  const s = AUDIO_SETS[set]
  const out = { [s.url]: patch.audioUrl }
  if (patch.wordTimings) out[s.timings] = patch.wordTimings
  if (patch.audioMeta) out[s.meta] = patch.audioMeta
  return out
}

// Готовый нейтральный patch из реплики сцены (кэш по hash для reuseFrom/reuseSet)
export function patchFromLine(line, set = 'original') {
  const part = audioPartOf(line, set)
  if (!part?.audioUrl) return null
  const patch = { audioUrl: part.audioUrl }
  if (part.wordTimings) patch.wordTimings = part.wordTimings
  if (part.audioMeta) patch.audioMeta = part.audioMeta
  return patch
}

// → { items: [{ index, set, text, hash, who, reuseFrom, reuseSet }], generate, chars, ready, total,
//     sets, bySet: { [set]: { total, withText, ready, items, generate, chars } } }
// total/ready — по первому набору (совместимость с прежним планом только по оригиналу)
export function planVoiceAll(scene, sets = ['original']) {
  const tl = Array.isArray(scene?.timeline) ? scene.timeline : []
  const chars = scene?.characters ?? {}
  const readyByHash = new Map() // hash → { index, set } любого набора с актуальным файлом
  for (const set of Object.keys(AUDIO_SETS)) {
    tl.forEach((l, i) => {
      const meta = audioPartOf(l, set)?.audioMeta
      if (setState(set, l, chars[l?.who], scene) === 'ready' && meta?.hash && !readyByHash.has(meta.hash)) readyByHash.set(meta.hash, { index: i, set })
    })
  }
  const items = []
  const firstInPlan = new Map()
  const bySet = {}
  for (const set of sets) {
    const own = []
    let withText = 0
    tl.forEach((l, i) => {
      const text = setText(set, l)
      if (!text) return
      withText += 1
      if (setState(set, l, chars[l?.who], scene) === 'ready') return
      const hash = audioHash(text, setSpec(set, chars[l?.who], scene))
      const src = readyByHash.get(hash) ?? firstInPlan.get(hash) ?? null
      if (!src) firstInPlan.set(hash, { index: i, set })
      own.push({ index: i, set, text, hash, who: l.who, reuseFrom: src ? src.index : null, reuseSet: src ? src.set : null })
    })
    const gen = own.filter(x => x.reuseFrom === null)
    bySet[set] = { total: tl.length, withText, ready: withText - own.length, items: own.length, generate: gen.length, chars: sumChars(gen.map(x => x.text)) }
    items.push(...own)
  }
  const toGenerate = items.filter(x => x.reuseFrom === null)
  const first = bySet[sets[0]] ?? { total: tl.length, ready: tl.length }
  return { items, generate: toGenerate.length, chars: sumChars(toGenerate.map(x => x.text)), ready: first.ready, total: first.total, sets, bySet }
}

// Хватит ли квоты: remaining null — неизвестно (функция квоты недоступна)
export function quotaVerdict(plan, quota) {
  if (!quota || typeof quota.limit !== 'number') return { known: false, remaining: null, enough: null }
  const remaining = Math.max(0, quota.limit - (quota.used ?? 0))
  return { known: true, remaining, enough: remaining >= plan.chars }
}

// Последовательный прогон плана.
//   generate(item) → нейтральный patch { audioUrl, wordTimings, audioMeta } (бросает при ошибке)
//   apply(index, patch, set) — положить результат в сцену (patch уже в полях набора — toSetPatch)
//   reusePatch(index, set) → нейтральный patch готовой реплики сцены (кэш по hash, patchFromLine)
//   onProgress({ done, total, index, set, ok, error? }) — после каждой реплики
//   isStopped() → true — остановиться перед следующей репликой
// Возвращает { ok: [индексы], failed: [{ index, set, error }], stopped, skipped: [индексы] }
// (индекс реплики может повториться — по разу на набор)
export async function runVoicePlan(plan, { generate, apply, reusePatch = null, onProgress = () => {}, isStopped = () => false }) {
  const result = { ok: [], failed: [], stopped: false, skipped: [] }
  const done = new Map() // hash → нейтральный patch (переиспользование внутри прогона)
  for (let k = 0; k < plan.items.length; k++) {
    const item = plan.items[k]
    const set = item.set ?? 'original'
    if (isStopped()) { result.stopped = true; result.skipped = plan.items.slice(k).map(x => x.index); break }
    try {
      let patch = done.get(item.hash)
      if (!patch && item.reuseFrom !== null && reusePatch) patch = reusePatch(item.reuseFrom, item.reuseSet ?? 'original')
      if (!patch) patch = await generate(item)
      if (!patch?.audioUrl) throw new Error('пустой результат генерации')
      done.set(item.hash, patch)
      apply(item.index, toSetPatch(patch, set), set)
      result.ok.push(item.index)
      onProgress({ done: k + 1, total: plan.items.length, index: item.index, set, ok: true })
    } catch (e) {
      const error = e?.message || String(e)
      result.failed.push({ index: item.index, set, error })
      onProgress({ done: k + 1, total: plan.items.length, index: item.index, set, ok: false, error })
    }
  }
  return result
}
