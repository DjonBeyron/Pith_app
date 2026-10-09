// Вопрос ноды «Сказать фразу» в ленте — обычный текстовый пузырь учителя (TextModule): фраза на английском, ниже
// спокойной серой строкой просьба «Скажите фразу вслух»; перевод (если задан) — кнопкой на пузыре, как у любого текста
// с переводом. Модуль ленты не тянет код распознавания (он в ленивом чанке панели) — только этот файл. Строим «текстовую» ноду из данных ноды: свой вид пузыря не заводим.
export const SAY_PROMPT = 'Скажите фразу вслух'
const PHRASE_COLOR = '#ffffff'
const PROMPT_COLOR = '#9aa0b4'

export function sayPromptNode(node, data) {
  const content = `${data.phrase}\n${SAY_PROMPT}`
  const split = data.phrase.length
  return {
    ...node,
    type: 'text',
    typeData: {
      text: {
        content,
        highlights: [
          { start: 0, end: split, color: PHRASE_COLOR, mode: 'text', opacity: 1 },
          { start: 0, end: split, mode: 'bold' },
          { start: split + 1, end: content.length, color: PROMPT_COLOR, mode: 'text', opacity: 1 },
        ],
        ...(data.translation ? { pro: true, proText: data.translation } : {}),
      },
    },
  }
}
