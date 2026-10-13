export type HomeIcon='match'|'create'|'join'|'doubles'|'player'|'practice'|'court'|'arrow';
const paths:Record<HomeIcon,string>={
  match:'<path d="m13 2-8 11h6l-1 9 9-12h-6l1-8Z"/>',
  create:'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 12h18M12 4v16M8 8h8M8 16h8"/>',
  join:'<path d="M14 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5M3 12h13m-5-5 5 5-5 5"/>',
  doubles:'<circle cx="8" cy="7" r="3"/><circle cx="17" cy="8" r="2.5"/><path d="M2 20v-3a6 6 0 0 1 12 0v3M16 13a5 5 0 0 1 6 5v2"/>',
  player:'<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2M8 16l4 3 4-3"/>',
  practice:'<ellipse cx="14" cy="8" rx="5.5" ry="7" transform="rotate(35 14 8)"/><path d="m10 13-6 8m-1-1 2 2M12 3l6 8M9 7l6 8M17 2l-7 9M20 6l-7 9"/>',
  court:'<rect x="3" y="2" width="18" height="20" rx="2"/><path d="M3 12h18M6 2v20M18 2v20M6 7h12M6 17h12M12 7v10"/>',
  arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>'
};
/** Inline, consistent stroke icons: no emoji, font dependency or remote assets. */
export function homeIcon(icon:HomeIcon){
  return `<svg class="home-icon" data-icon="${icon}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[icon]}</svg>`;
}
