/** @jsxImportSource hono/jsx */
import type { Child } from "hono/jsx";
import { asset } from "../lib/assets";

interface LayoutProps {
  title: string;
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  children: Child;
}

export function Layout({
  title,
  description = "Clippy — instant web clipboard with real-time sync",
  ogTitle,
  ogDescription,
  children,
}: LayoutProps) {
  const socialTitle = ogTitle ?? title;
  const socialDescription = ogDescription ?? description;

  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#0c1222" />
        <meta name="color-scheme" content="dark" />
        <meta name="description" content={description} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={socialTitle} />
        <meta property="og:description" content={socialDescription} />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={socialTitle} />
        <meta name="twitter:description" content={socialDescription} />
        <title>{title}</title>
        <link rel="manifest" href={asset("manifest.json")} />
        <link rel="icon" href={asset("icons/icon-192.png")} />
        <link rel="apple-touch-icon" href={asset("icons/icon-192.png")} />
        <link rel="stylesheet" href={asset("app.css")} />
        <script src={asset("htmx.min.js")} defer></script>
        <script src={asset("app.js")} defer></script>
      </head>
      <body>
        <div id="toast-host" class="toast-host" aria-live="polite" aria-atomic="true"></div>
        {children}
      </body>
    </html>
  );
}
