// Флаг «рассказ Пита о Памяти уже показан» — один раз на устройстве. Ключ тот же,
// что был у старого текстового окна (MemoryIntro), чтобы тем, кто его уже видел, рассказ не всплывал.
const FLAG = 'pithy_memory_intro_v1'

// Нет доступа к хранилищу (приватный режим) — считаем «видел»: лучше не показать, чем показывать при каждом входе
export const memoryStorySeen = () => { try { return !!localStorage.getItem(FLAG) } catch { return true } }

export function markMemoryStorySeen() {
  try { localStorage.setItem(FLAG, '1') } catch { /* приватный режим — покажем ещё раз */ }
}
