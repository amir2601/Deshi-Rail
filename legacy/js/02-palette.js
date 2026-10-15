'use strict';

// =====================================================================
// 2. PALETTE  (32 colours for every sprite and tile; only the time-of-day
//    sky, the colour tint and the additive glow pass add colours on top)
// =====================================================================
const PALETTE = {
  ink:      '#140c1c', navy:      '#1b1f3b', indigo:     '#2c2f5e', slate:     '#4a4f84',
  purple:   '#6b4a7d', rose:      '#b85d6e', orange:     '#e8875a', peach:     '#f4c27a',
  skyDeep:  '#3d7fc4', skyMid:    '#6aaee0', skyLight:   '#a8d8ef', white:     '#f4f4ec',
  cloudShade:'#c4cedb', grayLight:'#9a9aa8', gray:       '#6c6c7a', grayDark:  '#43434f',
  brownDark:'#3e2a22', brown:     '#6e4a32', tan:        '#b08a5c', cream:     '#ecdcae',
  glow:     '#ffd65c', amber:     '#f0a030', red:        '#c23a30', rust:      '#8c4a3a',
  greenDeep:'#12382a', greenDark: '#1e5a36', green:      '#2e7d3e', grass:     '#4f9a3c',
  grassLight:'#86c04a', paddy:    '#c4c95a', haze:       '#4f7f6c', blue:      '#2a5a9c',
};

// Palette lighting: each lighting remaps palette keys onto other palette
// keys, and every sprite is pre-rendered once per lighting.
// Light sources (lit windows, lamps, headlight) use PALETTE directly;
// p.glow / p.amber are yellow *paint* (safety line, signs) and do darken.
const LIGHTING = {
  day:   { lit: false, map: {} },
  dusk:  { lit: true, map: {
    slate: 'indigo', orange: 'rose', peach: 'orange', glow: 'peach', amber: 'orange',
    skyDeep: 'slate', skyMid: 'purple', skyLight: 'rose', white: 'peach', cloudShade: 'rose',
    grayLight: 'gray', gray: 'grayDark', grayDark: 'navy',
    brownDark: 'ink', brown: 'brownDark', tan: 'rust', cream: 'peach', red: 'rust', rust: 'brown',
    greenDeep: 'ink', greenDark: 'greenDeep', green: 'greenDark', grass: 'green',
    grassLight: 'grass', paddy: 'tan', haze: 'slate', blue: 'indigo',
  } },
  night: { lit: true, map: {
    navy: 'ink', indigo: 'navy', slate: 'indigo', purple: 'indigo', rose: 'purple',
    orange: 'purple', peach: 'rose', glow: 'tan', amber: 'rust',
    skyDeep: 'navy', skyMid: 'indigo', skyLight: 'slate', white: 'slate', cloudShade: 'indigo',
    grayLight: 'slate', gray: 'indigo', grayDark: 'navy',
    brownDark: 'ink', brown: 'navy', tan: 'purple', cream: 'slate', red: 'purple', rust: 'indigo',
    greenDeep: 'ink', greenDark: 'greenDeep', green: 'greenDeep', grass: 'greenDeep',
    grassLight: 'greenDark', paddy: 'greenDark', haze: 'navy', blue: 'indigo',
  } },
};
