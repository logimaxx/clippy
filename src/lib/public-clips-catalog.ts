/** Curated public clips seeded for Klipwall + SEO. */

export interface PublicClipSeed {
  slug: string;
  language: string | null;
  content: string;
}

export const PUBLIC_CLIPS_CATALOG: PublicClipSeed[] = [
  {
    slug: "git-cheat-sheet",
    language: "bash",
    content: `# Git cheat sheet

## Everyday
git status
git add -p                 # stage interactively
git commit -m "message"
git pull --rebase
git push

## Branches
git switch -c feature/x    # create + switch
git switch main
git branch -d feature/x    # delete local
git push -u origin HEAD

## Undo (safe)
git restore file.ts        # discard working tree changes
git restore --staged file.ts
git reset --soft HEAD~1    # undo commit, keep changes staged

## Inspect
git log --oneline --graph -20
git diff
git diff --staged
git show HEAD

## Stash
git stash push -m "wip"
git stash list
git stash pop

## Remotes
git remote -v
git fetch origin
git rebase origin/main

Tip: prefer \`git switch\` / \`git restore\` over older checkout/reset habits for day-to-day work.`,
  },
  {
    slug: "docker-compose-quickstart",
    language: "markdown",
    content: `# Docker Compose quickstart

## Minimal web + db

\`\`\`yaml
services:
  web:
    image: nginx:alpine
    ports:
      - "8080:80"
    depends_on:
      - db
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_PASSWORD: secret
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
\`\`\`

## Common commands
docker compose up -d
docker compose ps
docker compose logs -f web
docker compose exec db psql -U postgres
docker compose down          # stop
docker compose down -v       # stop + delete volumes

## Tips
- Put secrets in a \`.env\` file next to compose.yaml (Compose loads it automatically).
- Prefer named volumes over bind mounts for databases.
- Pin image tags (\`postgres:16-alpine\`) instead of \`latest\` in production.
- Healthchecks + \`depends_on: condition: service_healthy\` avoid racey startups.`,
  },
  {
    slug: "ssh-config-examples",
    language: "bash",
    content: `# Useful ~/.ssh/config examples

Host *
  AddKeysToAgent yes
  IdentitiesOnly yes

# Short alias
Host box
  HostName 203.0.113.10
  User deploy
  IdentityFile ~/.ssh/id_ed25519
  Port 22

# Jump host (bastion)
Host internal
  HostName 10.0.0.12
  User app
  ProxyJump bastion

Host bastion
  HostName bastion.example.com
  User jump
  IdentityFile ~/.ssh/id_ed25519

# GitHub with a dedicated key
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_github

## Quick checks
ssh -G box                 # print effective config
ssh-add -l                 # list loaded keys
ssh -v box                 # verbose connect debug

Keep private keys chmod 600 and never commit them.`,
  },
  {
    slug: "markdown-cheatsheet",
    language: "markdown",
    content: `# Markdown cheat sheet

## Headings
# H1
## H2
### H3

## Emphasis
*italic* or _italic_
**bold** or __bold__
~~strikethrough~~

## Lists
- Item
- Nested
  - Child

1. One
2. Two

## Links & images
[Webklip](https://webklip.com)
![alt text](/path/to/image.png)

## Code
Inline \`code\`

\`\`\`ts
const hello = "world";
\`\`\`

## Quote & rule
> Blockquote

---

## Table
| Name | Role |
|------|------|
| Ada  | Eng  |
| Lin  | Ops  |

## Task list
- [x] Done
- [ ] Todo`,
  },
  {
    slug: "curl-examples",
    language: "bash",
    content: `# Practical curl examples

## GET / POST JSON
curl https://httpbin.org/get
curl -X POST https://httpbin.org/post \\
  -H "Content-Type: application/json" \\
  -d '{"name":"webklip"}'

## Auth & headers
curl -H "Authorization: Bearer $TOKEN" https://api.example.com/me
curl -u user:pass https://example.com/secret

## Save output / follow redirects
curl -L -o page.html https://example.com
curl -O https://example.com/file.zip

## Uploads
curl -F "file=@./notes.txt" https://example.com/upload

## Debugging
curl -v https://example.com          # request/response headers
curl -w "\\nHTTP %{http_code} time %{time_total}s\\n" -o /dev/null -s https://example.com

## Timouts
curl --connect-timeout 5 --max-time 30 https://example.com

Pro tip: add \`-sS\` for quiet output that still shows errors.`,
  },
  {
    slug: "sql-joins-cheatsheet",
    language: "sql",
    content: `-- SQL joins cheat sheet

-- INNER JOIN: rows matching in both tables
SELECT u.name, o.total
FROM users u
INNER JOIN orders o ON o.user_id = u.id;

-- LEFT JOIN: all users, orders when present
SELECT u.name, o.total
FROM users u
LEFT JOIN orders o ON o.user_id = u.id;

-- RIGHT JOIN: all orders, users when present
SELECT u.name, o.total
FROM users u
RIGHT JOIN orders o ON o.user_id = u.id;

-- FULL OUTER JOIN (when supported)
SELECT u.name, o.total
FROM users u
FULL OUTER JOIN orders o ON o.user_id = u.id;

-- Anti-join: users with no orders
SELECT u.*
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
WHERE o.id IS NULL;

-- Self join
SELECT e.name AS employee, m.name AS manager
FROM employees e
LEFT JOIN employees m ON m.id = e.manager_id;

-- Tip: filter on the outer table in WHERE carefully —
-- predicates on the right table of a LEFT JOIN can turn it into an INNER JOIN.`,
  },
  {
    slug: "json-escape-examples",
    language: "markdown",
    content: `# JSON escape examples

## Characters to escape inside strings
- Quote (") -> \\"
- Backslash (\\) -> \\\\
- Newline -> \\n
- Tab -> \\t
- Unicode skull -> \\u2620

## Examples
Raw: He said "hi"
JSON string: "He said \\"hi\\""

Raw: path C:\\temp\\file.txt
JSON string: "C:\\\\temp\\\\file.txt"

Raw: two lines
JSON string: "line1\\nline2"

## Valid tiny document
{
  "ok": true,
  "count": 3,
  "note": "no trailing commas"
}

Tips:
- Prefer JSON.stringify / language encoders over hand-escaping
- Keys must be double-quoted strings
- Trailing commas are invalid in standard JSON`,
  },
];

export const PUBLIC_CLIP_SLUGS = new Set(PUBLIC_CLIPS_CATALOG.map((c) => c.slug));
