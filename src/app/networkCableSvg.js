// Разметка анимации «оборванный кабель» для экрана «Нет подключения / Слабое соединение» (порт «режима сна» вкладки
// «Моя память»: кабель рвётся посередине, на концах искрит — ladderTear.js / ladderSparks.js). Здесь кабели
// ВОЛНООБРАЗНЫЕ и идут по диагонали от нижнего левого угла к верхнему правому, разрыв — в центре экрана (там же
// текст). Чистый inline SVG: стили и мерцание (только opacity/transform) — блок «ng-cable-css» в index.html.
// ТРИ КОПИИ одной разметки: здесь (React, NetworkProblem.jsx), в public/net-guard.js (оверлей) и в
// public/offline.html (самодостаточный файл, подключить net-guard.js он не может — в кэше сервис-воркера только он сам).
// Тест networkGuard.test.js сверяет все три побайтно (без пробелов между тегами). Менять — парно.
export const NETWORK_CABLE_SVG = [
  '<svg class="ngCable" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid meet" aria-hidden="true">',
  '<g transform="translate(195 422) rotate(-63.4)">',
  '<path class="ngWs ngL" d="M-760 0C-727.2 26.7 -702.8 26.7 -670 0S-612.8 -26.7 -580 0S-522.8 26.7 -490 0S-432.8 -26.7 -400 0S-342.8 26.7 -310 0S-252.8 -26.7 -220 0C-203.6 13.3 -189.3 20 -175 20"/>',
  '<path class="ngWc ngL" d="M-760 0C-727.2 26.7 -702.8 26.7 -670 0S-612.8 -26.7 -580 0S-522.8 26.7 -490 0S-432.8 -26.7 -400 0S-342.8 26.7 -310 0S-252.8 -26.7 -220 0C-203.6 13.3 -189.3 20 -175 20"/>',
  '<g transform="translate(-175 20) scale(2.2)">',
  '<path class="ngStrand" stroke="#4fb3ee" d="M0 0Q7.8 -6 14 -7.7"/><path class="ngStrand" stroke="#b6fe3b" d="M0 0Q5.4 4 10.3 3.8"/><path class="ngStrand" stroke="#f1bd3c" d="M0 0Q7.6 8.9 9.9 13.8"/>',
  '<g class="ngBolt" style="--p:3.7s;--d:0.4s"><path class="ngHalo" d="M 0 0 L 2.6 -0.7 L 5.7 -1.4 L 8.6 -4 L 11.5 -5.9 L 13.8 -7.4"/><path class="ngCore" d="M 0 0 L 2.6 -0.7 L 5.7 -1.4 L 8.6 -4 L 11.5 -5.9 L 13.8 -7.4"/><path class="ngStar" d="M 0 0 L 2.5 1.1 M 0 0 L -0.3 2.3 M 0 0 L -3 -0.1 M 0 0 L 0.5 -2.1"/></g>',
  '<g class="ngBolt ngB" style="--p:5.9s;--d:2.2s"><path class="ngHalo" d="M 0 0 L 3 0.3 L 6.5 -0.8 L 10.9 -0.8 L 15.4 -0.4 L 18.4 -0.9"/><path class="ngCore" d="M 0 0 L 3 0.3 L 6.5 -0.8 L 10.9 -0.8 L 15.4 -0.4 L 18.4 -0.9"/></g>',
  '<line class="ngFly" x2="2" y2="0.1" style="--p:2.9s;--d:0.2s;--mx:5.4px;--my:2.7px;--tx:11.1px;--ty:0.5px"/>',
  '</g>',
  '<g transform="rotate(180)">',
  '<path class="ngWs ngR" d="M-760 0C-727.2 26.7 -702.8 26.7 -670 0S-612.8 -26.7 -580 0S-522.8 26.7 -490 0S-432.8 -26.7 -400 0S-342.8 26.7 -310 0S-252.8 -26.7 -220 0C-203.6 13.3 -189.3 20 -175 20"/>',
  '<path class="ngWc ngR" d="M-760 0C-727.2 26.7 -702.8 26.7 -670 0S-612.8 -26.7 -580 0S-522.8 26.7 -490 0S-432.8 -26.7 -400 0S-342.8 26.7 -310 0S-252.8 -26.7 -220 0C-203.6 13.3 -189.3 20 -175 20"/>',
  '<g transform="translate(-175 20) scale(2.2)">',
  '<path class="ngStrand" stroke="#b6fe3b" d="M0 0Q5.4 -5.6 7.5 -9.4"/><path class="ngStrand" stroke="#f1bd3c" d="M0 0Q9 4.4 17.9 1.8"/><path class="ngStrand" stroke="#4fb3ee" d="M0 0Q6.5 7.6 10.2 9.5"/>',
  '<g class="ngBolt ngB" style="--p:4.6s;--d:1.3s"><path class="ngHalo" d="M 0 0 L 3.6 -2.1 L 7.9 -3.4 L 11.6 -2.8 L 15.4 -4.2"/><path class="ngCore" d="M 0 0 L 3.6 -2.1 L 7.9 -3.4 L 11.6 -2.8 L 15.4 -4.2"/><path class="ngStar" d="M 0 0 L 0.6 2.6 M 0 0 L -2.5 1.2 M 0 0 L -0.1 -2.4 M 0 0 L 2.8 -0.8"/></g>',
  '<g class="ngBolt" style="--p:3.1s;--d:3.6s"><path class="ngHalo" d="M 0 0 L 3.5 2.3 L 6.6 2.9 L 9.7 4.2 L 12.8 6.3"/><path class="ngCore" d="M 0 0 L 3.5 2.3 L 6.6 2.9 L 9.7 4.2 L 12.8 6.3"/></g>',
  '<line class="ngFly" x2="1.9" y2="-0.6" style="--p:4.3s;--d:1.7s;--mx:5px;--my:1.1px;--tx:8.6px;--ty:-2.5px"/>',
  '</g>',
  '</g>',
  '</g>',
  '</svg>',
].join('')
