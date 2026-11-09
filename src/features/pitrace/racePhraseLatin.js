// Кириллица → латиница для сравнения фраз (racePhraseForms.normForms → racePhraseScore / racePhraseWrongWord). tokenize из speechMatch.js стирает всё, кроме латиницы, поэтому русская фраза
// (стенд пилюль, features/pillstand: русские фразы на русской модели Vosk) иначе не совпала бы ни с чем. Буква → латинская запись, «ё» ≡ «е», «ъ» / «ь» пропадают; цель и услышанное проходят одно
// и то же преобразование, допуск Левенштейна (speechMatch.tolerance) работает по латинской записи. Английский текст не меняется. Чистая функция.
const MAP = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'j', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' }
const CYR = /[а-яё]/gi

/** «Приятно познакомиться» → «priyatno poznakomitsya»; без кириллицы — как есть */
export const latinRu = text => String(text ?? '').replace(CYR, ch => { const low = ch.toLowerCase(); return MAP[low] ?? low })
