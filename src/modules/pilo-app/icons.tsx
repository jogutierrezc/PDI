/* Mr. Pilo · la app móvil · sus iconos: un solo trazo, sin relleno, en la tinta de quien los lleva. */

import type { ReactNode } from "react";

const Svg = ({ children }: { children: ReactNode }) => (
  <svg className="pa-i" viewBox="0 0 20 20" aria-hidden="true">
    {children}
  </svg>
);

export const Icon = {
  menu: <Svg><path d="M3 6h14M3 10h14M3 14h9" /></Svg>,
  close: <Svg><path d="M5 5l10 10M15 5L5 15" /></Svg>,
  plus: <Svg><path d="M10 4v12M4 10h12" /></Svg>,
  send: <Svg><path d="M10 16V4M5 9l5-5 5 5" /></Svg>,
  stop: <Svg><rect x="5.5" y="5.5" width="9" height="9" rx="1.5" /></Svg>,
  voice: <Svg><path d="M3 8v4h3l4 3V5L6 8H3zM13 7.5a3.5 3.5 0 010 5M15.5 5a7 7 0 010 10" /></Svg>,
  mute: <Svg><path d="M3 8v4h3l4 3V5L6 8H3zM13.5 8l4 4M17.5 8l-4 4" /></Svg>,
  listen: <Svg><path d="M3 8v4h3l4 3V5L6 8H3zM13 7.5a3.5 3.5 0 010 5" /></Svg>,
  copy: <Svg><rect x="7" y="7" width="9.5" height="9.5" rx="2" /><path d="M13 7V5.5a2 2 0 00-2-2H5.5a2 2 0 00-2 2V11a2 2 0 002 2H7" /></Svg>,
  check: <Svg><path d="M4.5 10.5l3.5 3.5 7.5-8" /></Svg>,
  up: <Svg><path d="M6 9v7.5H3.5V9zM6 9l3.2-6.5c1.4 0 2.1.9 1.8 2.3L10.6 7.5h4.9a1.6 1.6 0 011.6 1.9l-1 5.7a1.6 1.6 0 01-1.6 1.4H6" /></Svg>,
  down: <Svg><path d="M6 11V3.5H3.5V11zM6 11l3.2 6.5c1.4 0 2.1-.9 1.8-2.3l-.4-2.7h4.9a1.6 1.6 0 001.6-1.9l-1-5.7a1.6 1.6 0 00-1.6-1.4H6" /></Svg>,
  trash: <Svg><path d="M4.5 6h11M8.5 9.5v4.5M11.5 9.5v4.5M5.5 6l.8 10.5h7.4L14.5 6M7.5 6V3.5h5V6" /></Svg>,
  // Las pantallas de la cuenta (0120).
  mark: <Svg><path d="M5.5 3.5h9v13l-4.5-3.4-4.5 3.4v-13z" /></Svg>,
  user: <Svg><circle cx="10" cy="7" r="3" /><path d="M4 16.5c.8-2.9 3.2-4.3 6-4.3s5.2 1.4 6 4.3" /></Svg>,
  back: <Svg><path d="M16 10H4M9 5l-5 5 5 5" /></Svg>,
  chat: <Svg><path d="M3.5 4.5h13v9H9l-3.5 3v-3h-2v-9z" /></Svg>,
  dot: <Svg><circle cx="10" cy="10" r="2.5" /></Svg>,
  search: <Svg><circle cx="9" cy="9" r="5" /><path d="M13 13l3.5 3.5" /></Svg>,
};
