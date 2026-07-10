#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const args = process.argv.slice(2);
const baseUrl = getArg("--url", "http://localhost:3000");
const slug = getArg("-l", "") || getArg("--slug", "");
const message = getArg("-m", "") || getArg("--message", "");
const filePath = getArg("-f", "") || getArg("--file", "");
const pin = getArg("-p", "") || getArg("--pin", "");
const webhook = getArg("-w", "") || getArg("--webhook", "");
const maxViews = getArg("--max-views", "");
const burnOff = args.includes("--no-burn");
const get = args.includes("-g") || args.includes("--get");
const help = args.includes("-h") || args.includes("--help");

if (help || (!get && !message && !filePath) || !slug) {
  console.log(`Clippy CLI

Usage:
  clippy -l <slug> -m <message>              Create/update clip
  clippy -l <slug> -f <file>                 Upload file to clip
  clippy -l <slug> -g                        Get clip content (API read)
  clippy -l <slug> -m "text" -p <pin>        Set content with PIN
  clippy -l <slug> -m "text" -w <url>        Set webhook URL
  clippy -l <slug> -m "text" --max-views 3   Limit to 3 reads
  clippy -l <slug> -m "text" --no-burn       Disable burn-on-read

Options:
  -u, --url         Server URL (default: http://localhost:3000)
  -l, --slug        Clip slug
  -m, --message     Message content
  -f, --file        File to upload
  -p, --pin         PIN (for protected clips)
  -w, --webhook     Webhook URL (on create)
  --max-views N     Max API reads before delete (0 = unlimited)
  --no-burn         Disable burn-on-read on create
  -g, --get         Fetch clip via API (counts as read)
`);
  process.exit(help ? 0 : 1);
}

const apiBase = `${baseUrl.replace(/\/$/, "")}/api/v1`;
const headers: Record<string, string> = {};
if (pin) headers["X-Clip-Pin"] = pin;

if (get) {
  const res = await fetch(`${apiBase}/clips/${slug}`, { headers });
  if (!res.ok) {
    console.error(`Error: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const data = (await res.json()) as {
    content: string;
    burned?: boolean;
    contentType?: string;
  };
  if (data.burned) console.error("(burned after read)");
  if (data.contentType === "file" || data.contentType === "image") {
    console.error("(clip has file attachment — open in browser)");
  }
  console.log(data.content);
  process.exit(0);
}

if (filePath) {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }
  const form = new FormData();
  form.append("file", file, basename(filePath));

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/${slug}/upload`, {
    method: "POST",
    headers: pin ? { "X-Clip-Pin": pin } : {},
    body: form,
  });
  if (!res.ok) {
    console.error(`Upload failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  console.log(`Uploaded to ${baseUrl}/${slug}`);
  process.exit(0);
}

if (message) {
  const createBody: Record<string, unknown> = { content: message };
  if (pin) createBody.pin = pin;
  if (webhook) createBody.webhook = webhook;
  if (maxViews) createBody.maxViews = Number(maxViews);
  if (burnOff) createBody.burnOnRead = false;

  let res = await fetch(`${apiBase}/clips/${slug}`, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ content: message }),
  });

  if (!res.ok) {
    res = await fetch(`${apiBase}/clips/${slug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createBody),
    });
    if (!res.ok) {
      console.error(`Error: ${res.status} ${await res.text()}`);
      process.exit(1);
    }
    console.log(`Created: ${baseUrl}/${slug}`);
  } else {
    console.log(`Updated: ${baseUrl}/${slug}`);
  }
}

function getArg(flag: string, fallback: string): string {
  const i = args.indexOf(flag);
  if (i !== -1 && args[i + 1]) return args[i + 1];
  return fallback;
}
