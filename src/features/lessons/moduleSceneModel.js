// Чистая логика привязки сцены библиотеки к модулю ленты (ModuleScenePanel.jsx,
// ModuleSceneLibrary.jsx, метка в списке модулей админки) — без React, с тестами.
// Данные: curricula.scene_id → scenes.id (миграция 20261014150000). Ученик получает
// сцену только при status = 'published' (RLS), поэтому к привязке предлагаются
// только опубликованные, а привязанный черновик — предупреждение.

// Строки библиотеки → только опубликованные, поиск по названию (без регистра)
export function publishedSceneRows(rows, query = '') {
  const q = String(query ?? '').trim().toLowerCase()
  const list = Array.isArray(rows) ? rows.filter(r => r?.status === 'published') : []
  return q ? list.filter(r => String(r.title ?? '').toLowerCase().includes(q)) : list
}

// Состояние привязки по данным модуля и ответу getScene(sceneId):
//   none — сцены нет; loading — ответ ещё не пришёл; published — всё хорошо;
//   draft — в библиотеке снята с публикации (лента покажет модуль без сцены);
//   deleted — строки нет (удалена; после миграции scene_id обнулится сам);
//   error — не удалось проверить (сеть, нет таблицы)
export function sceneLinkState({ sceneId, row, error = null, loaded = false }) {
  if (!sceneId) return 'none'
  if (error) return 'error'
  if (!loaded) return 'loading'
  if (!row) return 'deleted'
  return row.status === 'published' ? 'published' : 'draft'
}

const LINK_TEXT = {
  none: 'Сцена не привязана — в ленте видео фразы (или заглушка)',
  loading: 'Проверяю сцену в библиотеке…',
  published: 'Сцена привязана и опубликована — лента показывает её вместо видео',
  draft: 'Сцена в библиотеке сейчас ЧЕРНОВИК — ученик её не получит, лента покажет модуль без сцены. Опубликуйте сцену в «Сцены» или привяжите другую',
  deleted: 'Сцена удалена из библиотеки — лента покажет модуль без сцены. Привяжите другую или уберите ссылку',
  error: 'Не удалось проверить сцену в библиотеке',
}
export function sceneLinkText(state, error = null) {
  if (state === 'error' && error?.message) return `${LINK_TEXT.error}: ${error.message}`
  return LINK_TEXT[state] ?? LINK_TEXT.none
}

// Уровень индикатора для стилей: ok | warn | bad | dim
export function sceneLinkTone(state) {
  if (state === 'published') return 'ok'
  if (state === 'draft' || state === 'error') return 'warn'
  if (state === 'deleted') return 'bad'
  return 'dim'
}

// Кнопка панели в тулбаре схемы: сцена привязана → 🎭, иначе 🎬; подсветка — есть
// хоть что-то для ленты
export function mediaButtonMeta({ sceneId = null, videoUrl = null } = {}) {
  const scene = !!sceneId
  const video = !!videoUrl
  return {
    icon: scene ? '🎭' : '🎬',
    on: scene || video,
    title: scene
      ? (video ? 'В ленте — сцена (видео остаётся запасным)' : 'В ленте — сцена')
      : (video ? 'Видео фразы загружено' : 'Видео фразы не загружено'),
  }
}

// Метка в списке модулей админки (AdminModulesTab): { text, tone: 'ok' | 'warn' }
export function moduleMediaChip(m) {
  if (m?.scene_id) return { text: '🎭 сцена', tone: 'ok' }
  if (m?.video_url) return { text: 'видео есть', tone: 'ok' }
  return { text: 'нет видео', tone: 'warn' }
}

// «Применить» из сборщика в режиме ленты: сцена идёт в библиотеку как published —
// в существующую строку (saved.id: открыли привязанную или уже нажали «Сохранить»)
// либо новой строкой. Название — из сцены, в пределах CHECK (1–80)
export function builderSavePayload(scene, saved = null) {
  const title = (String(scene?.title ?? '').trim() || 'Без названия').slice(0, 80)
  return { id: saved?.id ?? null, title, scene, status: 'published' }
}
