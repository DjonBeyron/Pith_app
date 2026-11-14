// Включатель эпизода «Мия» (прототип): по умолчанию включён; localStorage pithy_race_mia_v1 = '0' выключает (для сравнения и отладки), '1' — снова включает.
export const MIA_KEY = 'pithy_race_mia_v1'
export const miaOn = (storage = globalThis.localStorage) => { try { return storage?.getItem(MIA_KEY) !== '0' } catch { return true } }
