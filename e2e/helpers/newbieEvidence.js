import { mkdirSync } from 'node:fs'

// Доказательства для отчёта покрытия плана новичка (scripts/newbie-coverage-report.mjs → report/newbie-coverage.md).
// Каждый сценарий e2e/newbie-coverage-*.spec.js в конце прикладывает «итог» — JSON { item, seen, ... }, а скрипт отчёта
// складывает его в таблицу вместе с видео и трассой прогона (они включены для всего проекта newbie, см. playwright.config.js).
//   proof(...)  — пункт проверен автоматически: item (номер пункта плана), seen (что увидел человек — живой текст с экрана)
//   manual(...) — автоматически проверить нельзя: не skip, а запись о причине (попадает в отчёт как «только руками»)
//   shot(...)   — скриншот ключевого момента (шторка, ответ, плашка): report/newbie-screens/<пункт>-<slug>.png + вложение; отчёт вставляет
//                 картинки в строку пункта по префиксу имени. Папка в git не коммитится (/report/ в .gitignore), в CI уходит артефактом newbie-evidence.
// Размер экрана доказательных прогонов — 375×812 (test.use в спеках), как у самого узкого телефона из плана.
export const SCREENS_DIR = 'report/newbie-screens'

export async function shot(page, testInfo, item, slug) {
  mkdirSync(SCREENS_DIR, { recursive: true })
  const name = `${item}-${slug}`.replace(/[^\p{L}\p{N}._-]+/gu, '-')
  const path = `${SCREENS_DIR}/${name}.png`
  await page.screenshot({ path, fullPage: false }).catch(() => null)
  await testInfo.attach(`скриншот ${name}`, { path, contentType: 'image/png' }).catch(() => null)
}

// page — приложить заодно скриншот итогового экрана (<пункт>-итог.png)
export async function proof(testInfo, item, seen, { page = null, ...extra } = {}) {
  await testInfo.attach('итог', { body: JSON.stringify({ item, seen: String(seen).replace(/\s+/g, ' ').trim(), ...extra }), contentType: 'application/json' })
  if (page) await shot(page, testInfo, item, 'итог')
}

export const manual = (testInfo, item, why, extra = {}) =>
  testInfo.attach('итог', { body: JSON.stringify({ item, manual: true, why, ...extra }), contentType: 'application/json' })

// Текст шторки/окна глазами человека (для поля seen)
export const textOf = async locator => (await locator.first().innerText()).replace(/\s+/g, ' ').trim()
