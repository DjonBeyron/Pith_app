// Organic bezier curve between two points — ported from old project's neuronPath.
// Uses a seeded pseudo-random wobble so each connection looks slightly different
// but stays stable across re-renders (same seed → same curve).
function seededRand(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0
  return Math.abs(Math.sin(h) * 43758.5453) % 1
}

function neuronPath(x1, y1, x2, y2, seed) {
  const dx = x2 - x1, dy = y2 - y1, w = 28
  const cp1x = x1 + dx * 0.25 + (seededRand(seed + 'a') - 0.5) * w
  const cp1y = y1 + dy * 0.25 + (seededRand(seed + 'b') - 0.5) * w * 0.4
  const cp2x = x2 - dx * 0.25 + (seededRand(seed + 'c') - 0.5) * w
  const cp2y = y2 - dy * 0.25 + (seededRand(seed + 'd') - 0.5) * w * 0.4
  return `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`
}

// connections: [{ from: nodeId, to: nodeId }]
// nodes: array of node objects with x, y, size
export default function CanvasConnections({ connections, nodes }) {
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]))

  return (
    <>
      {connections.map(c => {
        const a = byId[c.from]
        const b = byId[c.to]
        if (!a || !b) return null
        const seed = c.from + c.to
        const d = neuronPath(a.x + 18, a.y + 36, b.x + 18, b.y, seed)
        return (
          <g key={seed}>
            <path d={d} stroke="#b6fe3b" strokeWidth="6" fill="none" opacity="0.10" />
            <path d={d} stroke="#b6fe3b" strokeWidth="1.5" fill="none" opacity="0.65" />
          </g>
        )
      })}
    </>
  )
}
