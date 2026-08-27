import { useState, useEffect } from 'react'
import { loadFavoriteColors, saveFavoriteColors } from '../../../shared/api/highlightPresetsApi.js'

// Своя строка в highlight_color_presets — не 'global' (старый, больше не
// используемый id от снятой модалки покраски, см. highlightPresetsApi.js)
export const RICH_TEXT_FAV_ID = 'richtext'

// Тулбар монтируется заново на каждое новое выделение текста (RichTextField
// рендерит его условно) — без кэша каждое открытие заново ждало бы ответ
// Supabase, и избранное секунду показывалось пустым, раздвигая панель уже
// ПОСЛЕ того как она появилась. Кэш на модуль — избранное грузится один раз
// за сессию, дальше отдаётся сразу, синхронно с первым рендером.
const cache = {}
const inFlight = {}

function load(id) {
  if (cache[id]) return Promise.resolve(cache[id])
  if (!inFlight[id]) {
    inFlight[id] = loadFavoriteColors(id).then(data => { cache[id] = data; return data })
  }
  return inFlight[id]
}

// Даже с кэшем самое ПЕРВОЕ открытие тулбара в сессии всё равно ждёт сеть.
// Чтобы к моменту, когда пользователь реально выделит текст, ответ уже
// пришёл — запускаем загрузку заранее, как только смонтировалось само поле
// (RichTextField), а не когда появился тулбар (что происходит позже, по
// выделению)
export function preloadRichTextFavorites(id) {
  load(id)
}

export function useRichTextFavorites(id) {
  const [favs, setFavs] = useState(cache[id] ?? [])

  useEffect(() => {
    if (cache[id]) return
    load(id).then(setFavs)
  }, [id])

  async function update(next) {
    cache[id] = next
    setFavs(next)
    await saveFavoriteColors(next, id)
  }

  return [favs, update]
}
