// Формат JSON-сценария SVG-сцены (стенд «два кота разговаривают»).
// version: 1
// {
//   version: 1,
//   characters: [{ id, name, colors: { body, belly, ear, eye, nose, stripe? }, voice: { pitch, rate } }],
//   background: 'office' | 'kitchen',
//   timeline: [{ who: <character id>, text, pose?, emotion? }]
// }
// Без БД и сервера: сценарий живёт в памяти страницы / в textarea стенда.

export const SCENE_VERSION = 1

export const BACKGROUNDS = ['office', 'kitchen']
export const EMOTIONS = ['neutral', 'happy', 'tired', 'surprised']
export const POSES = ['idle', 'talk', 'lean']
export const MOUTH_SHAPES = ['closed', 'half', 'open']

const DEFAULT_COLORS = {
  body: '#f2a65a',
  belly: '#fde7c8',
  ear: '#f6a9a3',
  eye: '#5aa36b',
  nose: '#e58a8a',
  stripe: '#d9843d',
}

const DEFAULT_VOICE = { pitch: 1, rate: 1 }

function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v) }

// Список человекочитаемых ошибок; пустой массив — сценарий годный
export function validateScene(scene) {
  const errors = []
  if (!isObj(scene)) return ['Сценарий должен быть объектом']
  if (scene.version !== SCENE_VERSION) errors.push(`version должен быть ${SCENE_VERSION}`)

  if (!Array.isArray(scene.characters) || scene.characters.length === 0) {
    errors.push('characters — непустой массив')
  } else {
    if (scene.characters.length > 2) errors.push('Сцена рассчитана на двух персонажей (слева/справа)')
    scene.characters.forEach((c, i) => {
      if (!isObj(c)) { errors.push(`characters[${i}] — объект`); return }
      if (typeof c.id !== 'string' || !c.id) errors.push(`characters[${i}].id — строка`)
      if (typeof c.name !== 'string') errors.push(`characters[${i}].name — строка`)
      if (c.colors !== undefined && !isObj(c.colors)) errors.push(`characters[${i}].colors — объект цветов`)
      if (c.voice !== undefined) {
        if (!isObj(c.voice)) errors.push(`characters[${i}].voice — объект {pitch, rate}`)
        else {
          const { pitch, rate } = c.voice
          if (pitch !== undefined && !(pitch >= 0 && pitch <= 2)) errors.push(`characters[${i}].voice.pitch — число 0…2`)
          if (rate !== undefined && !(rate >= 0.1 && rate <= 10)) errors.push(`characters[${i}].voice.rate — число 0.1…10`)
        }
      }
    })
  }

  if (scene.background !== undefined && !BACKGROUNDS.includes(scene.background)) {
    errors.push(`background — один из: ${BACKGROUNDS.join(', ')}`)
  }

  if (!Array.isArray(scene.timeline) || scene.timeline.length === 0) {
    errors.push('timeline — непустой массив реплик')
  } else {
    const ids = new Set((scene.characters ?? []).map(c => c?.id))
    scene.timeline.forEach((l, i) => {
      if (!isObj(l)) { errors.push(`timeline[${i}] — объект`); return }
      if (!ids.has(l.who)) errors.push(`timeline[${i}].who — id персонажа (${[...ids].join(', ')})`)
      if (typeof l.text !== 'string' || !l.text.trim()) errors.push(`timeline[${i}].text — непустая строка`)
      if (l.pose !== undefined && !POSES.includes(l.pose)) errors.push(`timeline[${i}].pose — ${POSES.join('/')}`)
      if (l.emotion !== undefined && !EMOTIONS.includes(l.emotion)) errors.push(`timeline[${i}].emotion — ${EMOTIONS.join('/')}`)
    })
  }
  return errors
}

// Дополняет сценарий значениями по умолчанию (цвета, голос, фон, поза/эмоция)
export function normalizeScene(scene) {
  return {
    version: SCENE_VERSION,
    background: scene.background ?? 'office',
    characters: scene.characters.map(c => ({
      id: c.id,
      name: c.name ?? c.id,
      colors: { ...DEFAULT_COLORS, ...(c.colors ?? {}) },
      voice: { ...DEFAULT_VOICE, ...(c.voice ?? {}) },
    })),
    timeline: scene.timeline.map(l => ({
      who: l.who,
      text: l.text.trim(),
      pose: l.pose ?? 'talk',
      emotion: l.emotion ?? 'neutral',
    })),
  }
}

// Текст из textarea → { scene, error }. Ошибка парсинга или валидации — одной строкой
export function parseScene(text) {
  let raw
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return { scene: null, error: `JSON не разобран: ${e.message}` }
  }
  const errors = validateScene(raw)
  if (errors.length) return { scene: null, error: errors.join('; ') }
  return { scene: normalizeScene(raw), error: null }
}
