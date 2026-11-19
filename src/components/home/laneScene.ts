/**
 * Drawing for The Lane (beta): a stylised Taipei alley at dusk, after the target image in
 * docs/game (original folder). These are the scene's own art colours, not UI tokens.
 * Everything here is static markup built from constants (no user text), so it can be set as SVG innerHTML.
 */
export const C = {
  sky: '#F07AA0', far: '#7f878d', farDark: '#646c72', wallL: '#4c595b', wallR: '#5f6b6e', ground: '#363d40',
  kerb: '#D94A4A', teal: '#2F8C86', tealDk: '#1F5F5B', ink: '#20292B',
  warm: '#FFC56B', cool: '#F2FFF6', dimWin: '#2f393b', dimWarm: '#57503f', lanternDim: '#6e3a33', lantern: '#FF6B4A',
  pinkFlower: '#E04A8A', leaf: '#3F7A4A', leafDk: '#2e5b37', red: '#C8423B', yellow: '#E8C547', green: '#3f8f5a',
}

type P = [number, number]
const L = (u: number, v: number): P => { const b = 900 - 280 * u, t = -100 + 470 * u; return [1080 * u, b - v * (b - t)] }
const R = (u: number, v: number): P => { const p = L(u, v); return [1672 - 372 * u, p[1]] }
const sc = (u: number) => (1000 - 750 * u) / 1000
const pts = (a: P[]) => a.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ')
const quad = (f: typeof L, u0: number, u1: number, v0: number, v1: number) => `<polygon points="${pts([f(u0, v0), f(u1, v0), f(u1, v1), f(u0, v1)])}"/>`
const poly = (a: P[], fill: string) => `<polygon fill="${fill}" points="${pts(a)}"/>`
const rect = (x: number, y: number, w: number, h: number, rx = 0, fill = '') => `<rect${fill ? ` fill="${fill}"` : ''} x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${rx}"/>`
const circ = (x: number, y: number, r: number) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}"/>`
const txt = (x: number, y: number, s: string, size: number, fill: string, extra = '') =>
  `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${size.toFixed(1)}" fill="${fill}" text-anchor="middle" font-family="PingFang TC, Noto Sans TC, sans-serif" font-weight="600" ${extra}>${s}</text>`
const fillQuad = (f: typeof L, u0: number, u1: number, v0: number, v1: number, fill: string) => quad(f, u0, u1, v0, v1).replace('<polygon', `<polygon fill="${fill}"`)

export interface LaneItem {
  name: string
  geo: string
  dim: string
  lit: string
  /** Light pool on nearby ground or walls: cx, cy, rx, ry */
  pool: [number, number, number, number] | null
  kind: 'warm' | 'cool' | 'train'
}

/** Lights in switch-on order, from Auntie's stall outward */
export const LANE_ITEMS: LaneItem[] = []
const add = (name: string, geo: string, dim: string, lit: string, pool: LaneItem['pool'], kind: LaneItem['kind'] = 'warm') =>
  LANE_ITEMS.push({ name, geo, dim, lit, pool, kind })

{
  const [x, y] = L(0.11, 0.33)
  add('Auntie’s lamp', `<path d="M${x - 26} ${y + 6} Q${x} ${y - 30} ${x + 26} ${y + 6} Z"/>` + circ(x, y + 10, 9), C.dimWarm, C.warm, [x, 700, 240, 70])
  const s0 = L(0.04, 0.47)
  add('the 好鄰居 sign', rect(s0[0], s0[1] - 70, 250, 70, 6), '#8f8a7e', '#fff4d8', [s0[0] + 125, s0[1] + 40, 220, 50])
  const m0 = L(0.13, 0.31)
  add('the drinks menu', rect(m0[0], m0[1], 150, 140, 4), '#8c877a', '#fffaf0', null)
  add('the drinks fridge', quad(L, 0.215, 0.255, 0.0, 0.25), '#53605f', C.cool, [L(0.235, 0)[0] + 20, 760, 120, 40], 'cool')
}
add('the white vending machine', quad(L, 0.29, 0.325, 0, 0.22), '#bdb8ac', C.cool, [L(0.31, 0)[0] + 20, 735, 110, 34], 'cool')
add('the teal vending machine', quad(L, 0.33, 0.365, 0, 0.22), '#2c6d69', '#c9fff4', [L(0.35, 0)[0] + 20, 728, 100, 32], 'cool')
{
  const [x, y] = L(0.31, 0.62), s = sc(0.31)
  add('the shop sign', rect(x + 6, y - 150 * s, 52 * s, 150 * s, 3), '#8f8a7e', '#fff6dc', null)
}
for (const [i, v] of [[0, 0.5], [1, 0.66], [2, 0.82]]) add(`curved window ${i + 1}`, quad(R, 0.02, 0.2, v, v + 0.11), C.dimWin, C.warm, null)
{ const [x, y] = R(0.12, 0.29); add('the 福 door lamp', circ(x - 10, y, 10), C.dimWarm, C.warm, [x - 10, R(0.12, 0)[1] - 4, 90, 26]) }
const lanternPos: P[] = []
{ const a = L(0.46, 0.5), b = R(0.46, 0.5); for (let i = 1; i < 9; i++) { const t = i / 9; lanternPos.push([a[0] + (b[0] - a[0]) * t, a[1] + 60 * 4 * t * (1 - t) + 16]) } }
const lanterns = (ps: P[]) => ps.map(([x, y]) => `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="11" ry="14"/>`).join('')
add('the first lanterns', lanterns(lanternPos.slice(0, 4)), C.lanternDim, C.lantern, null)
add('the rest of the lanterns', lanterns(lanternPos.slice(4)), C.lanternDim, C.lantern, null)
for (const u of [0.5, 0.62, 0.74]) { const [x, y] = L(u, 0.27); add('a doorway lamp', circ(x + 8 * sc(u), y, 7 * sc(u) + 2), C.dimWarm, C.warm, [x + 10, L(u, 0)[1] - 2, 60 * sc(u) + 14, 14 * sc(u) + 5]) }
for (const u of [0.45, 0.6, 0.72]) { const [x, y] = R(u, 0.27); add('a doorway lamp', circ(x - 8 * sc(u), y, 7 * sc(u) + 2), C.dimWarm, C.warm, [x - 10, R(u, 0)[1] - 2, 60 * sc(u) + 14, 14 * sc(u) + 5]) }
{
  const winL: string[] = [], winR: string[] = []
  for (const u of [0.2, 0.32, 0.44, 0.56, 0.68, 0.8]) for (const v of [0.52, 0.68, 0.84]) winL.push(quad(L, u, u + 0.055, v, v + 0.085))
  for (const u of [0.3, 0.42, 0.54, 0.66, 0.78]) for (const v of [0.52, 0.68, 0.84]) winR.push(quad(R, u, u + 0.05, v, v + 0.085))
  const groups = (a: string[], order: number[]) => { const o = order.map(i => a[i]), out: string[][] = []; for (let i = 0; i < o.length; i += 3) out.push(o.slice(i, i + 3)); return out }
  const gl = groups(winL, [3, 11, 7, 15, 1, 9, 13, 5, 16, 0, 10, 4, 14, 2, 17, 6, 12, 8])
  const gr = groups(winR, [2, 7, 12, 0, 5, 10, 14, 3, 8, 1, 6, 11, 13, 4, 9])
  for (let i = 0; i < Math.max(gl.length, gr.length); i++) {
    if (gl[i]) add('apartment windows', gl[i].join(''), C.dimWin, C.warm, null)
    if (gr[i]) add('apartment windows', gr[i].join(''), C.dimWin, C.warm, null)
  }
}
add('the MRT lights', [0, 1, 2, 3, 4, 5, 6, 7].map(i => circ(1090 + i * 28, 492, 4)).join(''), '#5d6468', '#fff1c9', null)
add('the MRT train', '', '', '', null, 'train')
for (let i = 0; i < 3; i++) add('the far windows', [0, 1, 2, 3, 4].map(k => rect(1100 + i * 62 + (k % 2) * 18, 250 + k * 34, 12, 14)).join(''), '#6d7479', '#ffe3a8', null)

/** Everything behind the light pools: sky, buildings, street furniture */
export function laneBack(): string {
  let s = `<defs>
    <radialGradient id="lanePoolWarm"><stop offset="0" stop-color="${C.warm}" stop-opacity=".75"/><stop offset="1" stop-color="${C.warm}" stop-opacity="0"/></radialGradient>
    <radialGradient id="lanePoolCool"><stop offset="0" stop-color="#d9fff3" stop-opacity=".6"/><stop offset="1" stop-color="#d9fff3" stop-opacity="0"/></radialGradient>
    <clipPath id="laneGap"><rect x="1080" y="300" width="220" height="200"/></clipPath>
  </defs>`
  s += rect(0, 0, 1600, 900, 0, C.sky)
  s += `<g fill="${C.far}" stroke="${C.ink}" stroke-width="2">${rect(1090, 230, 70, 400)}${rect(1170, 180, 60, 450)}${rect(1236, 260, 70, 370)}</g>`
  s += `<g fill="${C.farDark}" stroke="${C.ink}" stroke-width="2">${rect(1190, 150, 26, 34)}${circ(1203, 146, 14)}</g>`
  s += `<g stroke="${C.ink}" stroke-width="2">${rect(1070, 478, 250, 26, 0, '#a7adb1')}${rect(1150, 504, 22, 120, 0, '#8b9296')}${rect(1240, 504, 22, 120, 0, '#8b9296')}</g>`
  s += `<g stroke="${C.ink}" stroke-width="2">${poly([[0, 900], [1080, 620], [1300, 620], [1672, 900]], C.ground)}</g>`
  s += `<g stroke="${C.kerb}" stroke-width="5" fill="none"><path d="M560 900 L1110 625"/><path d="M1460 900 L1270 625"/></g>`
  s += txt(1225, 690, '慢', 34, '#e9e5dc', 'opacity=".85"')
  s += `<g fill="#3a4144" stroke="${C.ink}" stroke-width="2"><ellipse cx="1020" cy="860" rx="70" ry="14"/></g>`
  s += `<g stroke="${C.ink}" stroke-width="2.5" stroke-linejoin="round">${poly([L(0, 0), L(1, 0), L(1, 1), L(0, 1)], C.wallL)}${poly([R(0, 0), R(1, 0), R(1, 1), R(0, 1)], C.wallR)}</g>`
  s += `<g stroke="${C.ink}" stroke-width="1.5" fill="none" opacity=".55">`
  for (const v of [0.45, 0.62, 0.78, 0.94]) s += `<path d="M${L(0, v)} L${L(1, v)}"/><path d="M${R(0, v)} L${R(1, v)}"/>`
  s += `</g><g fill="#b9bfc0" stroke="${C.ink}" stroke-width="2">`
  for (const [u, v] of [[0.24, 0.6], [0.47, 0.76], [0.62, 0.6], [0.83, 0.77]]) s += quad(L, u + 0.06, u + 0.085, v, v + 0.05)
  for (const [u, v] of [[0.36, 0.62], [0.6, 0.78]]) s += quad(R, u + 0.055, u + 0.075, v, v + 0.05)
  s += `</g><g stroke="${C.tealDk}" stroke-width="2.5" fill="none">`
  for (const v of [0.6, 0.76]) for (const [u0, u1] of [[0.18, 0.3], [0.42, 0.54]]) {
    s += `<path d="M${L(u0, v)} L${L(u1, v)}"/>`
    for (let k = 0; k <= 6; k++) { const t = u0 + (u1 - u0) * k / 6; s += `<path d="M${L(t, v)} L${L(t, v - 0.06)}"/>` }
  }
  s += `</g><g stroke="${C.tealDk}" stroke-width="3" fill="none">`
  for (const v of [0.49, 0.65, 0.81]) { const a = R(0, v), b = R(0.22, v); s += `<path d="M${a} Q${(a[0] + b[0]) / 2 + 30} ${a[1] + 18} ${b}"/>` }
  s += `</g><g stroke="${C.ink}" stroke-width="2">${fillQuad(R, 0.07, 0.17, 0, 0.25, '#7f8a8c')}</g>`
  { const [x, y] = R(0.12, 0.17); s += `<g transform="translate(${(x - 4).toFixed(1)} ${y.toFixed(1)}) rotate(45)">${rect(-16, -16, 32, 32, 0, C.red)}</g>` + txt(x - 4, y + 7, '福', 20, '#1c1c1c') }
  s += `<g stroke="${C.ink}" stroke-width="2.5" stroke-linejoin="round">${fillQuad(L, 0, 0.2, 0.3, 0.36, C.teal)}${fillQuad(L, 0.02, 0.2, 0.12, 0.3, '#3a4245')}${fillQuad(L, 0, 0.2, 0, 0.12, C.teal)}</g>`
  s += `<g fill="#c9ced0" stroke="${C.ink}" stroke-width="2">`
  for (const u of [0.035, 0.07]) { const [x, y] = L(u, 0.12); s += rect(x, y - 90, 44, 90, 6) }
  s += `</g><g stroke="${C.ink}" stroke-width="2.5">`
  for (const x of [300, 420, 540]) s += `<path d="M${x - 22} 890 L${x - 14} 812 M${x + 22} 890 L${x + 14} 812" fill="none"/><ellipse cx="${x}" cy="808" rx="34" ry="11" fill="${C.red}"/>`
  s += `</g><g stroke="${C.ink}" stroke-width="2">${rect(610, 790, 70, 50, 0, C.yellow)}${rect(610, 840, 70, 50, 0, C.green)}${rect(830, 770, 62, 54, 0, C.red)}</g>`
  s += `<g fill="#2c3336" stroke="${C.ink}" stroke-width="2">`
  for (const [x, y, k] of [[985, 690, 1], [1085, 650, 0.75], [1135, 632, 0.55], [1350, 700, 1.1], [1300, 668, 0.85], [1262, 645, 0.6]])
    s += `<path d="M${x - 30 * k} ${y} q${10 * k} ${-38 * k} ${40 * k} ${-38 * k} h${20 * k} l${8 * k} ${38 * k} z"/>` + circ(x - 22 * k, y + 4 * k, 9 * k) + circ(x + 26 * k, y + 4 * k, 9 * k)
  s += `</g><g stroke="${C.ink}" stroke-width="1.5">`
  for (const [x, y, r] of [[60, 800, 38], [95, 770, 30], [740, 760, 34], [770, 730, 26], [1420, 790, 40], [1460, 755, 34], [1540, 780, 46], [1580, 720, 38]])
    s += `<circle cx="${x}" cy="${y}" r="${r}" fill="${r % 4 ? C.leaf : C.leafDk}"/>`
  for (const [x, y] of [[1430, 840], [1530, 845], [80, 850]]) s += rect(x - 26, y - 30, 52, 50, 4, '#b0613f')
  for (let i = 0; i < 26; i++) s += `<circle cx="${(i * 53) % 300}" cy="${(i * 37) % 160}" r="${14 + (i % 3) * 5}" fill="${i % 3 ? C.pinkFlower : C.leafDk}"/>`
  s += `</g><g stroke="${C.ink}" stroke-width="2" fill="none">`
  for (const [u, sag] of [[0.3, 40], [0.55, 30], [0.75, 22]]) { const a = L(u, 0.9), b = R(u, 0.88); s += `<path d="M${a} Q800 ${(a[1] + b[1]) / 2 + sag} ${b}"/>` }
  { const a = L(0.46, 0.5), b = R(0.46, 0.5); s += `<path d="M${a} Q${(a[0] + b[0]) / 2} ${a[1] + 120} ${b}"/>` }
  s += `</g>`
  return s
}

/** Sign lettering, drawn above the lights so it stays readable when lit */
export function laneLabels(): string {
  const s0 = L(0.04, 0.47), m0 = L(0.13, 0.31), [vx, vy] = L(0.31, 0.62), vs = sc(0.31)
  let s = txt(s0[0] + 125, s0[1] - 22, '好鄰居', 40, C.ink)
  ;['紅茶 30', '冬瓜茶 30', '綠茶 40', '奶茶 55'].forEach((m, i) => { s += txt(m0[0] + 75, m0[1] + 32 + i * 30, m, 20, C.ink) })
  ;['雜', '貨', '店'].forEach((c, i) => { s += txt(vx + 6 + 26 * vs, vy - 150 * vs + 38 + i * 44 * vs, c, 30 * vs, C.ink) })
  return s
}

export const LANE_CAT = `<ellipse cx="700" cy="868" rx="26" ry="16"/><circle cx="722" cy="850" r="12"/><path d="M714 842 l3 -12 l6 9 z M726 840 l5 -11 l4 12 z"/><path d="M676 866 q-24 -6 -18 -30" fill="none"/>`
export const LANE_TRAIN = `<rect x="1080" y="452" width="230" height="28" rx="10" fill="#eef1f2" stroke="${C.ink}" stroke-width="2"/><rect x="1080" y="470" width="230" height="5" fill="#3a8fc7"/>${[0, 1, 2, 3, 4, 5, 6].map(i => `<rect x="${1092 + i * 30}" y="458" width="20" height="9" fill="#ffe3a8"/>`).join('')}`
