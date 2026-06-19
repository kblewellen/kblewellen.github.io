# kblewellen.github.io

Academic website for **Katelin Bailey Lewellen**, CS & Mathematics teacher at Phillips Academy Andover. Deployed via GitHub Pages at [kblewellen.github.io](https://kblewellen.github.io).

Pure static HTML/CSS/vanilla JS — no build system, no framework.

---

## Pages

| File | URL | Access |
|---|---|---|
| `index.html` | `/` | Public |
| `open_resources.html` | `/open_resources.html` | Public |
| `workshop.html` | `/workshop.html` | Password-protected (StatiCrypt) |

**`index.html`** — Main faculty profile. Sidebar navigation with sections for Projects, Courses, Tools, About, and Contact. Tool cards link to `open_resources.html`; individual tool links are disabled (`data-href`) until tools are publicly released.

**`open_resources.html`** — Tabbed tool index for students and teachers. Tabs: General · 401 Python · 411 Robotics · 454 Organization · 551 Algorithms · 571 Autonomous · MTH Mathematics · Teacher. Default view shows all public tools.

**`workshop.html`** — Teacher workshop tool index. AES-encrypted with [StatiCrypt](https://robinmoisson.github.io/staticrypt/). Contains live links to all four tools.

---

## Tools

| Tool | Path | Audience |
|---|---|---|
| AI Framework | *(coming)* | General |
| 411 Help | `student_tools/411_help/411_help_v4.html` | Students |
| AI Use Dashboard | `teacher_tools/411_help/411_help_heatmatp_v1.html` | Teachers |
| Gate Crashers | `edu_games/gate-crashers/index.html` | CSC 454 |
| VEX Sim | `vex_sim/index.html` | CSC 411, 571 |

Tools are built from original AI use framework and custom curriculum by Katelin Bailey Lewellen and the CS Skills system from CS@Andover. Code interfaces developed in collaboration with Claude Code.

---

## Deployment

The site deploys automatically from the `main` branch via GitHub Pages. No build step.

Push to `main` → live at `kblewellen.github.io` within ~60 seconds.

**Files to commit for a full deploy:**
- `index.html`, `open_resources.html`, `workshop.html` (encrypted)
- `headshot.jpg`
- `student_tools/`, `teacher_tools/`, `edu_games/`, `vex_sim/`
- `.staticrypt.json` (salt file — required for consistent re-encryption)

**Do not commit:** `raw/` (unencrypted workshop source), `*.dc.html` (legacy design references), `share_links.txt`.

---

## Re-encrypting workshop.html

`raw/workshop.html` is the editable source for the workshop page. After editing it, re-encrypt before pushing:

```bash
npx staticrypt raw/workshop.html -p "<password>" -o workshop.html
```

The `.staticrypt.json` salt file must be committed alongside `workshop.html` so the same password works across re-encryptions — browsers save the derived key in localStorage and won't re-prompt if the salt is consistent.

To test the password gate (clear browser memory):

```
DevTools → Application → Local Storage → kblewellen.github.io → delete staticrypt_* entries
```

---

## Design tokens

| Token | Value | Usage |
|---|---|---|
| `navy` | `#032260` | Sidebar background |
| `teal-deep` | `#0c5969` | Section kicker labels, links |
| `teal-mid` | `#375798` | Course code labels |
| `ink` | `#15202e` | Body text |
| `muted` | `#93a3b5` | Secondary labels |
| `page-bg` | `#ffffff` | Main content |
| `portal-bg` | `#f1f4f8` | Portal/workshop background |

Fonts: **Libre Franklin** (body) + **Spline Sans Mono** (labels/kickers) via Google Fonts.

---

## License

Content and curriculum materials: [CC BY-NC-SA 4.0](LICENSE.md) — Katelin Bailey Lewellen.  
Tool source code: see individual tool directories.
