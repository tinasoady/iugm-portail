// Cadre défilant des listes d'étudiants : le tableau défile à l'intérieur de
// sa carte (hauteur plafonnée) au lieu d'allonger toute la page, et la ligne
// d'en-tête reste visible pendant le défilement. Deux variantes selon le fond
// de la carte en mode sombre, car l'en-tête collant doit être opaque ; le
// filet sous l'en-tête est une ombre interne, car une bordure de ligne ne
// suit pas un en-tête collant.
//
// Classes écrites en toutes lettres (et non composées) pour que Tailwind les repère.
export const SCROLL_AREA_CLASS =
  "max-h-[28rem] overflow-auto overscroll-contain [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-white [&_thead_th]:shadow-[inset_0_-1px_0_rgb(0_0_0/0.1)] dark:[&_thead_th]:bg-zinc-900 dark:[&_thead_th]:shadow-[inset_0_-1px_0_rgb(255_255_255/0.1)]";

export const SCROLL_AREA_BLACK_CLASS =
  "max-h-[28rem] overflow-auto overscroll-contain [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-white [&_thead_th]:shadow-[inset_0_-1px_0_rgb(0_0_0/0.1)] dark:[&_thead_th]:bg-black dark:[&_thead_th]:shadow-[inset_0_-1px_0_rgb(255_255_255/0.1)]";
