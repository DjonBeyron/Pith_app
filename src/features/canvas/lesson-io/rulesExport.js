// Выгрузка правил из окна правил для Claude: файл lesson-drafts/rules.json — то, что читают scripts/lesson-rules.mjs (промпт автора, судья,
// калибровка). Чистые функции, без DOM; скачивание — одной функцией в панели
const FIELDS = ['id', 'category', 'active', 'title', 'group', 'checker', 'severity', 'text', 'bad', 'good']

/** Список правил → текст rules.json (только нужные поля, в порядке окна) */
export function rulesJson(rules) {
  return JSON.stringify(rules.map(r => Object.fromEntries(FIELDS.map(f => [f, r[f] ?? (f === 'active' ? true : '')]))), null, 2) + '\n'
}

/** Скачать rules.json в браузере */
export function downloadRulesJson(rules) {
  const url = URL.createObjectURL(new Blob([rulesJson(rules)], { type: 'application/json' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: 'rules.json' })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
