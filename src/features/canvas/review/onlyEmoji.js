// В модуль «реакция» нельзя добавить текст: остаются только эмодзи (комментарий пишется в поле замечания)
const EMOJI = /\p{Extended_Pictographic}\p{Emoji_Modifier}?(?:\ufe0f|\u200d\p{Extended_Pictographic}\p{Emoji_Modifier}?)*/gu
export const onlyEmoji = v => (String(v).match(EMOJI) ?? []).join('')
