import { lintPath } from './lintFieldMap.js'
import { COMMON_SLOT_IDS } from '../../scene/v2/sprites/slots.js'

// Замечание линтера → цепочка панелей сборщика (ui/Panel.jsx), которые его «содержат»:
// от внешней к вложенной. Ошибка подсвечивает КРАСНЫМ каждую панель цепочки (и свёрнутый
// родитель виден красным), предупреждение — янтарной меткой. Клик по замечанию
// разворачивает всю цепочку и фокусирует поле (lintFieldMap.findField).
// Ключи панелей: header (название/id в тулбаре), location, slots → slots.local | slots.common,
// characters → characters.a | characters.b → characters.a.voice, timeline → timeline.<i>,
// task, options (в т.ч. options.display / options.voice.* / options.translationVoiceId — панель
// «Параметры воспроизведения»); timeline[i].translationAudioUrl — та же цепочка timeline → timeline.<i>,
// characters.<who>.voice.translationVoiceId — до панели «Голос» персонажа.

export function panelKeysFor(text) {
  const path = lintPath(text)
  if (!path) return []
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.')
  const root = parts[0]
  switch (root) {
    case 'id': case 'title': case 'version': return ['header']
    case 'location': return ['location']
    case 'options': return ['options']
    case 'task': return ['task']
    case 'slots': {
      if (!parts[1]) return ['slots']
      return ['slots', COMMON_SLOT_IDS.includes(parts[1]) ? 'slots.common' : 'slots.local']
    }
    case 'characters': {
      const who = parts[1]
      if (who !== 'a' && who !== 'b') return ['characters']
      const out = ['characters', `characters.${who}`]
      if (parts[2] === 'voice') out.push(`characters.${who}.voice`)
      return out
    }
    case 'timeline': {
      if (!/^\d+$/.test(parts[1] ?? '')) return ['timeline']
      return ['timeline', `timeline.${parts[1]}`]
    }
    default: return []
  }
}

// Сводка по панелям: { [key]: { errors, warns } } — только панели, у которых что-то есть
export function panelLintState(lint) {
  const out = {}
  for (const x of lint ?? []) {
    for (const key of panelKeysFor(x.text)) {
      const s = out[key] ?? (out[key] = { errors: 0, warns: 0 })
      if (x.level === 'error') s.errors++
      else s.warns++
    }
  }
  return out
}

// Тон панели: 'error' (красная рамка, красный заголовок), 'warn' (янтарная метка) или null
export function panelTone(state, key) {
  const s = state?.[key]
  if (!s) return null
  return s.errors > 0 ? 'error' : s.warns > 0 ? 'warn' : null
}
