// Оттенки блоков сборщика (читаемость: на глаз отличать «Реплики» от «Предметов»). Цвет блока взят у
// ноды канваса/плеера по смыслу (цвета — NODE_TYPES в canvas/nodeTypes.js; значения продублированы в
// styles/admin-scenes-tones.css как --scb-tone-<оттенок>, тест panelTones.test.js сверяет их с нодами).
// Оттенок берётся по первому сегменту id панели: slots.local → slots, characters.a.voice → characters,
// timeline.3 → timeline. Новая панель без записи в карте получает нейтральный оттенок.
// Не путать с data-tone Panel — это уровень линтера (error | warn), он главнее оттенка (data-hue).
export const PANEL_TONES = {
  location: 'scene',          // Локация — нода «Сцена» (янтарный)
  slots: 'photo',             // Ячейки предметов — «Фото» (зелёный)
  characters: 'reaction',     // Персонажи (A/B, голос внутри) — «Реакция» (розовый)
  vars: 'phrase_assembly',    // Слова пользователя — «Собери фразу» (бирюзовый)
  timeline: 'audio',          // Реплики (и каждая реплика) — «Голосовое сообщение» (голубой)
  task: 'word_choice',        // Задание после сцены — «Выбери слово» (охра)
  options: 'system',          // Параметры воспроизведения — «Системное» (серо-синий)
  preview: 'video',           // Предпросмотр — «Видео» (фиолетовый)
  budget: 'pin_message',      // Бюджет узлов — «Закрепить» (горчичный)
  lint: 'neutral',            // Замечания линтера — без оттенка: цвет несёт сам линтер
  side: 'lesson_ref',         // JSON / нейросеть / Мои сцены — «Ссылка на урок» (синий)
}

export const NEUTRAL_TONE = 'neutral'

// id панели → ключ оттенка (имя группы в CSS: .scbPanel[data-hue="slots"]) или 'neutral'
export function panelHue(id) {
  const root = String(id ?? '').split('.')[0]
  return Object.prototype.hasOwnProperty.call(PANEL_TONES, root) ? root : NEUTRAL_TONE
}
