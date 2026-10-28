import { computeEnvelope } from '../../../../shared/lib/audioEnvelope.js'
import { AUDIO_SETS, audioPartOf } from '../../../scene/v2/sceneVoice.js'
import { hasVarParts } from '../../../scene/v2/sceneVarsSegments.js'

// Огибающая громкости реплики для «живого Пита v2» — сеть и выбор реплик (без React; тесты — voiceEnvelope.test.js).
//  · envelopeFromFile(file) — файл, только что полученный от ElevenLabs (generateAudio): audioMeta.env кладётся сразу при озвучке;
//  · envelopeFromUrl(url)  — уже озвученная реплика: файл скачивается по audioUrl (бакет R2 должен отдавать CORS — как для «Проверить звук»);
//  · envelopeTargets(scene) — какие реплики и наборы (оригинал / перевод) без огибающей. Нужен audioMeta.hash: без него audioMeta не пройдёт
//    валидатор сцены (hash обязателен), такие реплики пропускаются и считаются отдельно. Реплики-шаблоны (segments) — тоже мимо:
//    их файлы — части и слова из библиотеки, рот у них идёт только по буквам.

export const envelopeFromFile = file => file.arrayBuffer().then(buf => computeEnvelope(buf))

export async function envelopeFromUrl(url) {
  let res
  try { res = await fetch(url, { cache: 'no-store' }) } catch { throw new Error('файл не скачался (сеть или CORS бакета)') }
  if (!res.ok) throw new Error(`файл не скачался (HTTP ${res.status})`)
  return computeEnvelope(await res.arrayBuffer())
}

// Огибающая файла набора реплики или ошибка по-русски (нет файла / тишина / не скачалось). envelopeUrl подменяется в тестах
export async function envelopeFor(line, set, envelopeUrl = envelopeFromUrl) {
  const url = audioPartOf(line, set)?.audioUrl
  if (!url) throw new Error('у реплики нет файла озвучки')
  const env = await envelopeUrl(url)
  if (!env?.data) throw new Error('в файле тишина или он не разобрался')
  return env
}

// Поля audioMeta набора с огибающей → patch для actions.updateLine
export function envPatch(line, set, env) {
  const s = AUDIO_SETS[set] ?? AUDIO_SETS.original
  return { [s.meta]: { ...(line?.[s.meta] ?? {}), env } }
}

// → { todo: [{ index, set }], skipped: число реплик с файлом, но без audioMeta.hash }
export function envelopeTargets(scene) {
  const tl = Array.isArray(scene?.timeline) ? scene.timeline : []
  const todo = []
  let skipped = 0
  tl.forEach((l, index) => {
    for (const set of Object.keys(AUDIO_SETS)) {
      const part = audioPartOf(l, set)
      if (!part?.audioUrl || part.audioMeta?.env) continue
      if (set === 'original' && hasVarParts(l?.text)) continue
      if (set === 'translation' && hasVarParts(l?.translation)) continue
      if (part.audioMeta?.hash) todo.push({ index, set })
      else skipped += 1
    }
  })
  return { todo, skipped }
}

// Последовательный прогон «для всех»: runOne(index, set) → true | false; ошибка одной реплики не обрывает остальные
export async function runEnvelopePlan(todo, runOne, onProgress = () => {}) {
  let failed = 0
  for (let k = 0; k < todo.length; k++) {
    if (!(await runOne(todo[k].index, todo[k].set))) failed += 1
    onProgress({ done: k + 1, total: todo.length, failed })
  }
  return { failed }
}
