/** Dev-only live reload helpers. Active when LIVE_RELOAD_PORT is set by scripts/dev.ts. */

export function liveReloadPort(): string | null {
  if (process.env.WEBKLIP_DEV !== "1") return null;
  const port = process.env.LIVE_RELOAD_PORT?.trim();
  return port || null;
}

export function injectLiveReloadHtml(html: string, port: string): string {
  if (html.includes("__WEBKLIP_LR__")) return html;

  const snippet = `<script>(function(){if(window.__WEBKLIP_LR__)return;window.__WEBKLIP_LR__=1;var port=${JSON.stringify(port)};var up=true;function connect(){var proto=location.protocol==="https:"?"wss":"ws";var ws=new WebSocket(proto+"://"+location.hostname+":"+port+"/");ws.onmessage=function(e){try{var msg=JSON.parse(e.data);if(msg.type==="css"){document.querySelectorAll('link[rel="stylesheet"]').forEach(function(link){var u=new URL(link.href);u.searchParams.set("t",String(Date.now()));link.href=u.toString();});}else if(msg.type==="reload"){location.reload();}}catch(err){}};ws.onclose=function(){setTimeout(connect,400);};}connect();setInterval(function(){fetch("/api/health",{cache:"no-store"}).then(function(r){if(r.ok){if(!up)location.reload();up=true;}else{up=false;}}).catch(function(){up=false;});},2500);})();</script>`;

  if (html.includes("</body>")) {
    return html.replace("</body>", `${snippet}\n</body>`);
  }
  return `${html}\n${snippet}`;
}
