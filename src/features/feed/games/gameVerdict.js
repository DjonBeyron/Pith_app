// Подпись итога для шторок «Дополни реплику» и «Картинка» — без красного и без цифр, по образцу chooseTasks.verdictOf:
// «Верно!» (с первой попытки) / «Получилось — верно: слово» (были промахи). result — { ok } | null (ответа ещё нет)
export function gameVerdict(result, answer) {
  if (!result) return null
  if (result.ok) return { kind: 'ok', text: 'Верно!' }
  return { kind: 'bad', text: answer ? `Получилось — верно: ${answer}` : 'Получилось — ничего страшного' }
}
