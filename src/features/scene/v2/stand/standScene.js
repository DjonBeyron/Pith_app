import { normalizeSceneV2 } from '../sceneSchemaV2.js'

// Данные стенда сравнения ?scene=cmp (SceneCompareStand.jsx): разбор адреса и сцена из одной реплики Пита.
// Звук по умолчанию — настоящая речь из демо маскотов (Kokoro TTS, public/scene-cmp/, scripts/scene-cmp/make_demo_line.py) с ПРИБЛИЗИТЕЛЬНЫМИ
// таймингами слов (не ElevenLabs). Свой звук: ?scene=cmp&audio=<url>&text=<реплика>[&words=<url json [{word,start,end}]>][&env=0][&lite=1][&only=old|new].
//   audio — файл mp3/wav (тот же домен или с CORS); text — что в нём сказано (рот идёт по буквам);
//   words — тайминги слов (нет — синтетические по длительности файла, как в приложении без wordTimings);
//   env=0 — не считать огибающую громкости (рот новой версии — только по буквам); lite=1 — слабое устройство (только рот);
//   only=old | new — показать одну сцену (честный замер кадров: в обычном режиме кадры общие на обе).

export const DEFAULT_AUDIO = '/scene-cmp/pit-line.wav'
export const DEFAULT_WORDS = '/scene-cmp/pit-line.json'
const LINE_BY_SKIN = { kit: 'pit-line', mia: 'mia-line' }
const CHARACTER = { kit: { gender: 'male', name: 'Пит' }, mia: { gender: 'female', name: 'Мия' } }
// Файл без audioMeta.hash сцена не примет (нормализация), а стенду нужен env внутри audioMeta — ставим служебный hash
const STAND_HASH = '0'.repeat(64)

export function readStandParams(search) {
  const q = new URLSearchParams(search)
  const audio = q.get('audio')
  const skin = q.get('skin') === 'mia' ? 'mia' : 'kit'
  const line = `/scene-cmp/${LINE_BY_SKIN[skin]}`
  return {
    skin,
    audio: audio || `${line}.wav`,
    custom: !!audio,
    text: q.get('text') || '',
    words: q.get('words') || (audio ? null : `${line}.json`),
    env: q.get('env') !== '0',
    lite: q.get('lite') === '1',
    only: q.get('only') === 'old' || q.get('only') === 'new' ? q.get('only') : null,
  }
}

// Сцена: один маскот (skin kit — Пит, mia — Мия; одиночная сцена — кружок), одна реплика с файлом. env — огибающая (shared/lib/audioEnvelope.js) или null
export function buildStandScene({ text, audioUrl, words = null, env = null, skin = 'kit' }) {
  const meta = { hash: STAND_HASH, voiceId: 'stand' }
  if (env) meta.env = env
  const line = { who: 'a', text, emotion: 'neutral', pose: 'talk', face: 'base', audioUrl, audioMeta: meta }
  if (Array.isArray(words) && words.length) line.wordTimings = words
  return normalizeSceneV2({
    id: 'scene-compare', title: 'Сравнение: живой Пит', location: 'cafe',
    characters: { a: { kind: 'cat', ...CHARACTER[skin], skin, voice: { pitch: 1, rate: 1 } } },
    slots: { window: 'window', table: 'table', 'floor-left': 'plant' }, // без чашки (пар — своя анимация): считаем Пита, не предметы
    timeline: [line],
    options: { bubbles: true, autoplay: false, loop: false, display: 'text' },
  })
}
