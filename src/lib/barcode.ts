// Encodeur Code 128 (sous-ensemble B) autonome, sans dépendance.
// Génère les largeurs de modules d'un code-barres scannable à partir d'une
// chaîne ASCII (32–126) — typiquement un numéro de moteur/boîte.
//
// Rendu : une suite de largeurs alternant barre/espace, en commençant par une
// barre. Un code 128 valide = zone de silence + Start B + données + checksum
// + Stop. Le checksum (modulo 103) rend le code auto-vérifiable par le lecteur.

// Table standard des 103 symboles + Start (104) + Stop (106).
const PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312",
  "132212", "221213", "221312", "231212", "112232", "122132", "122231", "113222",
  "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131",
  "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321",
  "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121",
  "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321",
  "331121", "312113", "312311", "332111", "314111", "221411", "431111", "111224",
  "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114",
  "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112",
  "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113",
  "114311", "411113", "411311", "113141", "114131", "311141", "411131", "211412",
  "211214", "211232", "2331112", // 103=StartA, 104=StartB, 105=StartC, 106=Stop (7 modules)
];
const START_B = 104;
const STOP = 106;

/** Suite des valeurs de symboles (Start B + données + checksum + Stop). */
export function code128Values(value: string): number[] {
  const codes: number[] = [START_B];
  let sum = START_B;
  for (let i = 0; i < value.length; i++) {
    const v = value.charCodeAt(i) - 32;
    const sym = v >= 0 && v <= 94 ? v : 0; // hors plage → espace
    codes.push(sym);
    sum += sym * (i + 1);
  }
  codes.push(sum % 103); // checksum
  codes.push(STOP);
  return codes;
}

/**
 * Largeurs de modules alternant barre/espace (commence par une barre).
 * `modules` = tableau de largeurs ; la somme donne la largeur totale en modules.
 */
export function code128Modules(value: string): { modules: number[]; total: number } {
  const codes = code128Values(value);
  let s = "";
  for (const c of codes) s += PATTERNS[c];
  const modules = s.split("").map((d) => parseInt(d, 10));
  const total = modules.reduce((a, b) => a + b, 0);
  return { modules, total };
}
