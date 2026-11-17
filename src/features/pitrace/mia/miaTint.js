// Когда дорожки красятся в цвета Мии (.wl[data-mia='in'], race-mia.css): круг с Мией (m.fast) и, на церемонии финала «Шкала памяти», с момента, когда коробка падает на Пита (dropped, useMiaDrop) —
// плавно желтеют (переход 0,9 с в race-mia.css; владелец 2026-11-15). До падения цвета обычные. m — состояние машины Мии, stage — стадия, dropped — коробка уже упала.
export const miaColorOn = (m, stage, dropped) => m?.phase === 'in' && (!!m.fast || ((stage?.sid === 'boss-ann' || !!stage?.revBack) && !!dropped))
