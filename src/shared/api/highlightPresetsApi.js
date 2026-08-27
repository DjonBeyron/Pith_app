import { supabase } from './supabase.js'

// id строки — своя запись на каждого потребителя в одной и той же таблице.
// 'richtext' — плавающий тулбар покраски (полный стиль, см. RichTextToolbar,
// RICH_TEXT_FAV_ID в useRichTextFavorites.js). 'global' — legacy-запись от
// снятой модалки покраски: строка ["#...", ...] осталась в базе нетронутой,
// но больше никем не читается — id не удаляем, чтобы не терять чужие данные,
// просто ничего в код не завязано на конкретно этот id по умолчанию.
export async function loadFavoriteColors(id) {
  const { data, error } = await supabase
    .from('highlight_color_presets')
    .select('colors')
    .eq('id', id)
    .maybeSingle()
  if (error) return []
  return data?.colors ?? []
}

export async function saveFavoriteColors(colors, id) {
  await supabase
    .from('highlight_color_presets')
    .upsert({ id, colors })
}
