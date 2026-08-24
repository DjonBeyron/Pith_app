// Попадание курсора в ноду по мировым координатам — общее между рамкой
// выделения (CanvasBoard.jsx) и привязкой порта при отпускании (useCanvasPortDrag.js).
export const NODE_HIT_W = { nano: 42, mini: 255, max: 308 }
// max — прикидка высоты развёрнутой ноды для попадания при броске порта
// и рамке выделения; после увеличения текстовых полей ноды стали выше
export const NODE_HIT_H = { nano: 36, mini: 55,  max: 700 }

export function nodeAtPos(nodeList, wx, wy, excludeId) {
  return nodeList.find(n => {
    if (n.id === excludeId) return false
    const w = NODE_HIT_W[n.size] ?? 158
    const h = NODE_HIT_H[n.size] ?? 200
    return wx >= n.x && wx <= n.x + w && wy >= n.y && wy <= n.y + h
  })
}
