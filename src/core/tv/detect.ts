export interface TvDetection {
  isTv: boolean;
  reason: string;
  platform: string;
}

const TV_PATTERNS: Array<[RegExp, string]> = [
  [/Android TV|AndroidTV/i, 'Android TV'],
  [/GoogleTV/i, 'Google TV'],
  [/Tizen/i, 'Samsung Tizen'],
  [/Web0S|webOS/i, 'LG webOS'],
  [/SMART-TV|SmartTV|Smart TV/i, 'Smart TV'],
  [/BRAVIA/i, 'Sony Bravia'],
  [/Roku/i, 'Roku'],
  [/AFT[A-Z]|Fire TV|FireTV/i, 'Amazon Fire TV'],
  [/Philips.*TV|NetCast|HbbTV/i, 'TV HbbTV'],
  [/\bTV\b/i, 'Dispositivo TV genérico'],
  [/CrKey/i, 'Chromecast'],
  [/Xbox|PlayStation/i, 'Consola'],
];

/** Heuristic only: user agents lie, so the user can always toggle TV mode manually. */
export function detectTv(
  userAgent: string = typeof navigator !== 'undefined' ? navigator.userAgent : '',
): TvDetection {
  for (const [re, platform] of TV_PATTERNS) {
    if (re.test(userAgent))
      return { isTv: true, reason: `User agent coincide con ${platform}`, platform };
  }
  const coarse =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: none)').matches &&
    window.matchMedia('(hover: none)').matches;
  if (coarse)
    return {
      isTv: true,
      reason: 'Sin puntero ni hover (navegación por mando)',
      platform: 'Sin puntero',
    };
  return {
    isTv: false,
    reason: 'No se detectó una plataforma de TV',
    platform: 'Escritorio/móvil',
  };
}
