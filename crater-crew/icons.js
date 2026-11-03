// Original inline-SVG weapon icons for the armory tiles (chunky, dark outline, flat cartoon fills).
const S='stroke="#1c1420" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"';
const ICONS={
 bazooka:`<rect x="3" y="12" width="26" height="9" rx="4" fill="#4f7a5a" ${S}/><rect x="2" y="10" width="6" height="13" rx="2" fill="#2f4a40" ${S}/><rect x="24" y="10" width="6" height="13" rx="2" fill="#e0b26a" ${S}/><rect x="11" y="21" width="7" height="7" rx="2" fill="#2b3f3c" ${S}/>`,
 grenade:`<ellipse cx="16" cy="19" rx="9" ry="10" fill="#5b9a54" ${S}/><path d="M9 17h14M9 22h14" stroke="#b7e0a6" stroke-width="2" fill="none"/><rect x="13" y="4" width="7" height="6" rx="1.5" fill="#d5d2af" ${S}/><path d="M20 6l6-2" fill="none" ${S}/>`,
 shotgun:`<rect x="2" y="11" width="28" height="7" rx="2" fill="#5d6b72" ${S}/><path d="M2 18l12 0 6 9-8 0z" fill="#c9945a" ${S}/><rect x="25" y="9" width="5" height="11" rx="1.5" fill="#d9c78f" ${S}/>`,
 dynamite:`<rect x="8" y="10" width="9" height="19" rx="2" fill="#d24b49" ${S}/><rect x="17" y="10" width="9" height="19" rx="2" fill="#d24b49" ${S}/><rect x="8" y="14" width="18" height="4" fill="#f1dcb6" ${S}/><path d="M17 10l2-6" fill="none" ${S}/><circle cx="20" cy="4" r="2.6" fill="#ffd75e" ${S}/>`,
 airstrike:`<path d="M16 3l5 14-3-2v10h-4V15l-3 2z" fill="#f4efe2" ${S}/><path d="M13 22l-5 6M19 22l5 6" fill="none" ${S}/><circle cx="16" cy="9" r="2" fill="#e03d3a" ${S}/>`,
 punch:`<path d="M8 14c0-4 3-6 7-6h5c4 0 6 3 6 6v6c0 4-3 7-8 7h-4c-4 0-6-3-6-7z" fill="#f7a8bb" ${S}/><path d="M12 9v7M17 8v8M22 9v7" fill="none" stroke="#5a1d38" stroke-width="2"/>`,
 jetpack:`<rect x="6" y="5" width="8" height="18" rx="4" fill="#5c7d96" ${S}/><rect x="18" y="5" width="8" height="18" rx="4" fill="#5c7d96" ${S}/><path d="M10 25c-3 4-1 6 0 6s3-2 0-6zM22 25c-3 4-1 6 0 6s3-2 0-6z" fill="#ffb02e" ${S}/>`
};
export const weaponIcon=id=>ICONS[id]?`<svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">${ICONS[id]}</svg>`:'';
