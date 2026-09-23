// Переключатели для бисекции лага сворачивания iPhone (системная анимация
// app switcher дёргается почти с любого экрана). iOS замораживает процесс в
// момент сворачивания мгновенно (в логе hidden/visible приходят одним тиком),
// так что JS тут ни при чём — тяжело дереву слоёв композитора. Какому
// именно — выясняем выключая по одному: шарики-спойлер, видео ленты,
// SVG-текстуры (feTurbulence) на карточках/фонах, принудительные
// GPU-слои шапки (translateZ). Флаги живут в localStorage, применяются один
// раз при старте (класс на <html> + чтение из компонентов); кнопки — в
// панели DBG ленты (feed/DebugPanel.jsx), каждая перезагружает страницу.
//
// Видео-флаги — бисекция «дымки»/мигания видео на части Android (Mali-G72,
// Android 10: и в ленте, и в чате урока — значит, дело в выводе <video>, а не
// в ленте): noNudge выключает подталкивание слоя из videoLayerNudge.js (его
// переключение способа вывода само может мигать), videoGpu держит любое
// видео всегда на GPU-композиции (Android не переключает его на аппаратный
// оверлей и обратно на ходу — см. perf-flags.css)
const KEY = 'pithy_perf_flags'

export const PERF_FLAG_DEFS = [
  { key: 'noBubbles',  label: 'шарики выкл' },
  { key: 'noVideo',    label: 'видео ленты выкл' },
  { key: 'noTextures', label: 'SVG-текстуры выкл' },
  { key: 'noLayers',   label: 'GPU-слои шапки выкл' },
  { key: 'noNudge',    label: 'подталкивание видео выкл' },
  { key: 'videoGpu',   label: 'видео через GPU' },
  // Мгновенная проверка теории «диапазон 16–235 прочитан как 0–255»: если
  // растяжение контраста в 255/219 раз убирает дымку — теория верна
  { key: 'videoContrast', label: '+контраст (тест дымки)' },
  // Обход дымки: кадры рисуются в canvas (как стоп-кадр — с верными цветами),
  // сам <video> прячется. Лента — useFeedVideoCanvas.js, уроки — videoMirror.js
  { key: 'videoCanvas', label: 'видео через canvas' },
]

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {} } catch { return {} }
}

export const perfFlags = read()

export function togglePerfFlag(key) {
  const next = { ...read(), [key]: !read()[key] }
  if (!next[key]) delete next[key]
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* не критично */ }
  location.reload()
}

// Классы на <html> для CSS-переключателей (см. perf-flags.css)
export function applyPerfFlagClasses() {
  const el = document.documentElement
  if (perfFlags.noTextures) el.classList.add('perf-no-textures')
  if (perfFlags.noLayers)   el.classList.add('perf-no-layers')
  if (perfFlags.videoGpu)   el.classList.add('perf-video-gpu')
  if (perfFlags.videoContrast) el.classList.add('perf-video-contrast')
}

export function perfFlagsSummary() {
  const on = PERF_FLAG_DEFS.filter(d => perfFlags[d.key]).map(d => d.key)
  return on.length ? on.join(',') : 'нет'
}
