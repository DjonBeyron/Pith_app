// Сводка к dodge-frames.mjs: по каждому ходу головы по x (смена left больше 3 px) — за сколько мс и за сколько кадров она дошла, и есть ли кадры «пропала» (opacity 0 / hidden); кадры > 33 / 50 мс.
import { readFileSync } from 'node:fs'

const S = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const rows = S.rows
const hidden = rows.filter(r => r[4] === '0' || r[5] === 'hidden' || r[6] === '0').length
console.log(`кадров с головой: ${rows.length}, «пропала» (opacity 0 / hidden): ${hidden}`)
let n = 0
for (let i = 1; i < rows.length; i++) {
  const d = Math.abs(rows[i][1] - rows[i - 1][1])
  if (d < 3) continue
  // ход начался на кадре i; ищем, где left снова перестаёт меняться (меньше 0,5 px за кадр)
  let j = i
  while (j + 1 < rows.length && Math.abs(rows[j + 1][1] - rows[j][1]) >= 0.5 && rows[j + 1][0] - rows[j][0] < 100) j++
  const path = rows.slice(i - 1, j + 1).map(r => r[1].toFixed(0)).join('>')
  n++
  console.log(`ход ${n} t=${rows[i][0]}: ${rows[i - 1][1]} → ${rows[j][1]} px, ${Math.round(rows[j][0] - rows[i - 1][0])} мс, ${j - i + 1} кадров, режим «${rows[i][3]}»; путь ${path}`)
  i = j
}
const dts = S.dt.map(x => x[1])
console.log(`кадры: всего ${dts.length}, > 33 мс: ${dts.filter(x => x > 33).length}, > 50 мс: ${dts.filter(x => x > 50).length}, худший ${Math.max(...dts)} мс`)
