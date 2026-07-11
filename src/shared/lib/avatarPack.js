// Готовый пак аватарок DiceBear (https://www.dicebear.com) — свои картинки
// пользователь загрузить не может, только выбрать одну из этого списка.
// Стиль и сиды фиксированы на клиенте; сервер (RPC set_avatar) отдельно
// проверяет формат сида (см. supabase_schema.sql) — держать значения тут
// в виде простых латинских слов без спецсимволов.
export const AVATAR_STYLE = 'adventurer'

export const AVATAR_SEEDS = [
  'Boots', 'Whiskers', 'Noodle', 'Waffle', 'Pickle', 'Mochi',
  'Biscuit', 'Peanut', 'Nugget', 'Taco', 'Pretzel', 'Marshmallow',
  'Cookie', 'Muffin', 'Bagel', 'Toffee', 'Caramel', 'Sprinkle',
  'Jellybean', 'Butterscotch', 'Pancake', 'Donut', 'Cupcake', 'Gummy',
]

export function avatarUrl(seed) {
  return `https://api.dicebear.com/9.x/${AVATAR_STYLE}/svg?seed=${encodeURIComponent(seed)}`
}
