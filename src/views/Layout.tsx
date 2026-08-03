/** @jsxImportSource hono/jsx */
import type { Child } from "hono/jsx";
import { asset } from "../lib/assets";
import { THEME_INIT_SCRIPT, ThemeToggle } from "./ThemeToggle";

interface LayoutProps {
  title: string;
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  /** Use "none" when the page embeds ThemeToggle in its own top bar. */
  themeToggle?: "floating" | "none";
  /** Body class — use "with-chrome" for marketing pages with site header/footer. */
  bodyClass?: string;
  /** robots meta; private clips should stay noindex */
  robots?: string;
  children: Child;
}

export function Layout({
  title,
  description =
    "Webklip — online clipboard with live sync and temporary sharing",
  ogTitle,
  ogDescription,
  themeToggle = "floating",
  bodyClass,
  robots,
  children,
}: LayoutProps) {
  const socialTitle = ogTitle ?? title;
  const socialDescription = ogDescription ?? description;

  return (
    <html lang="en" data-theme="light" data-theme-default="light">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="text-scale" content="scale" />
        <meta name="theme-color" content="#f0f7f5" />
        <meta name="color-scheme" content="light dark" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Webklip" />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <meta name="description" content={description} />
        {robots && <meta name="robots" content={robots} />}
        <meta property="og:type" content="website" />
        <meta property="og:title" content={socialTitle} />
        <meta property="og:description" content={socialDescription} />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={socialTitle} />
        <meta name="twitter:description" content={socialDescription} />
        <title>{title}</title>
        <link rel="manifest" href={asset("manifest.json")} />
        <link rel="icon" href={asset("icons/icon-192.png")} />
        <link rel="apple-touch-icon" href={asset("icons/apple-touch-icon.png")} />
        <link rel="stylesheet" href={asset("app.css")} />
        <script src={asset("htmx.min.js")} defer></script>
        <script src={asset("app.js")} defer></script>
      </head>
      <body class={bodyClass}>
        {themeToggle === "floating" && <ThemeToggle floating />}
        <div id="toast-host" class="toast-host" aria-live="polite" aria-atomic="true"></div>
        {children}
      </body>
    </html>
  );
}
