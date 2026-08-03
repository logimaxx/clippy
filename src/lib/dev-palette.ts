/**
 * Dev-only palette switcher for trying alternative color themes.
 * Active when WEBKLIP_DEV=1; the tokens live in assets/src/theme-alt.css,
 * which is only bundled by `build-assets.ts --dev`.
 */

export const DEV_PALETTES = ["default", "crisp"] as const;

export function devPaletteEnabled(): boolean {
  return process.env.WEBKLIP_DEV === "1";
}

const PALETTE_SCRIPT = `<script>(function(){if(window.__WEBKLIP_PALETTE__)return;window.__WEBKLIP_PALETTE__=1;
var KEY="webklip-palette";var NAMES=${JSON.stringify(DEV_PALETTES)};
function read(){try{var q=new URLSearchParams(location.search).get("palette");if(q&&NAMES.indexOf(q)!==-1){localStorage.setItem(KEY,q);return q;}var s=localStorage.getItem(KEY);return NAMES.indexOf(s)!==-1?s:"default";}catch(e){return "default";}}
function apply(name){var el=document.documentElement;if(name==="default"){delete el.dataset.palette;}else{el.dataset.palette=name;}var btn=document.getElementById("dev-palette-toggle");if(btn)btn.textContent="Palette: "+name;}
var current=read();apply(current);
function mount(){if(document.getElementById("dev-palette-toggle"))return;var btn=document.createElement("button");btn.type="button";btn.id="dev-palette-toggle";btn.title="Dev only — switch color palette";btn.textContent="Palette: "+current;btn.style.cssText="position:fixed;bottom:.65rem;left:.75rem;z-index:2147483000;padding:.3rem .6rem;font:600 11px/1.2 ui-sans-serif,system-ui,sans-serif;letter-spacing:.02em;color:var(--text-secondary,#333);background:var(--bg-elevated,#fff);border:1px solid var(--border-default,#999);border-radius:999px;box-shadow:0 2px 8px rgba(0,0,0,.18);cursor:pointer;opacity:.75";btn.addEventListener("mouseenter",function(){btn.style.opacity="1";});btn.addEventListener("mouseleave",function(){btn.style.opacity=".75";});btn.addEventListener("click",function(){current=NAMES[(NAMES.indexOf(current)+1)%NAMES.length];try{localStorage.setItem(KEY,current);}catch(e){}apply(current);});document.body.appendChild(btn);}
if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",mount);}else{mount();}
})();</script>`;

/** Applies the stored palette before paint and mounts a floating toggle. */
export function injectDevPaletteHtml(html: string): string {
  if (html.includes("__WEBKLIP_PALETTE__")) return html;
  if (html.includes("</head>")) {
    return html.replace("</head>", `${PALETTE_SCRIPT}\n</head>`);
  }
  if (html.includes("</body>")) {
    return html.replace("</body>", `${PALETTE_SCRIPT}\n</body>`);
  }
  return html;
}
