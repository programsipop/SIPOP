# SIPOP — Scientific Integrity and Publication Oversight Program

> **Scientific Rigor for Global Impact**

Institutional website for SIPOP, a program offering methodological auditing, technical review, and high-level mentorship for researchers aiming at global scientific publication.

---

## Screenshots

### Light Mode
![SIPOP — Light Mode](screenshots/light.png)

### Dark Mode
![SIPOP — Dark Mode](screenshots/dark.png)

---

## About the Project

SIPOP is an institutional website built from the ground up, including brand identity, visual design, and front-end development. The project encompasses:

- Full brand identity (logo, color palette, typography, visual system)
- Canva template pack (10 templates for Instagram and LinkedIn)
- Social media content strategy and copywriting
- Paid ad campaigns (Instagram carousels)
- Website design and development

---

## Tech Stack

- **Eleventy (11ty) v3** — static site generator with Nunjucks templating
- **Nunjucks (.njk)** — layouts, includes, and page templates
- **HTML5** — semantic structure
- **CSS3** — custom properties, CSS variables for theming, responsive grid
- **Vanilla JavaScript** — no frameworks or dependencies
- **Google Apps Script** — serverless form handling, data stored in Google Sheets
- **Netlify** — build and hosting
- **Google Fonts** — Inter typeface

---

## Features

- ✅ Fully responsive (mobile-first)
- ✅ Three-state theme toggle: light / dark / system preference
- ✅ Contact form connected to Google Sheets via Apps Script
- ✅ Email notifications on form submission via MailApp
- ✅ Smooth scroll navigation
- ✅ Background images swap between light/dark versions
- ✅ Semantic HTML with `aria-label` and `aria-live` attributes
- ✅ Multi-page: Home (`/`), Publications (`/publications`), Technical Review (`/technical-review`)
- ✅ No external JS dependencies

---

## Pages

| Page | Template | Description |
|---|---|---|
| `/` | `src/index.njk` | Landing page — hero, services, benefits, testimonials, contact form |
| `/publications` | `src/publications.njk` | Peer-reviewed publications supported by SIPOP |
| `/technical-review` | `src/technical-review.njk` | Dedicated LP for the Technical Review service |

---

## Brand

| Token | Value |
|---|---|
| Pine Blue | `#2C7A7B` |
| Pearl Aqua | `#81C7B7` |
| White Smoke | `#F4F4F4` |
| Pale Slate | `#CBD5E0` |
| Slate Black | `#0F172A` |
| Typeface | Inter (Google Fonts) |

---

## File Structure

```
sipop/
├── .eleventy.js                # Eleventy config — passthrough, dirs, engines
├── .eleventyignore             # Ignores node_modules and _site
├── .gitignore
├── netlify.toml                # Build command, publish dir, clean URL redirects
├── package.json
├── apps-script.gs              # Google Apps Script — paste into Apps Script editor
├── README.md
│
├── src/                        # Eleventy input dir
│   ├── index.njk               # Home page
│   ├── publications.njk        # Publications page
│   ├── technical-review.njk    # Technical Review landing page
│   │
│   ├── _includes/              # Nunjucks partials and layouts
│   │   ├── base.njk            # Base HTML layout (head, scripts, slots)
│   │   ├── lp-header.njk       # Minimal header for landing pages
│   │   ├── navbar.njk          # Main navigation bar
│   │   └── footer.njk          # Site footer
│   │
│   └── assets/                 # Static files — copied as-is to _site/assets/
│       ├── css/
│       │   ├── style.css           # Global styles, variables, theming
│       │   ├── publications.css    # Styles for /publications
│       │   └── technical-review.css # Styles for /technical-review
│       ├── js/
│       │   ├── script.js           # Theme toggle, form handler, scroll behavior
│       │   └── publications.js     # Publications page interactions
│       └── images/
│           ├── backgrounds/        # BG1, BG1DM, BG2, BG2DM (.webp)
│           ├── icons/              # Icon1–Icon7 (.webp)
│           ├── logo/               # Logo1, Logo2 (.webp)
│           ├── favicon/            # Icon.ico
│           └── testimonials/       # suzana, ivan, katia (.webp)
│
├── screenshots/
│   ├── light.png               # Full-page screenshot — light mode
│   └── dark.png                # Full-page screenshot — dark mode
│
└── design-sources/             # Source files — not deployed
    ├── logo1.png
    ├── logo2.png
    ├── backgrounds/            # .png originals
    └── icons-source/           # .ai originals
```

---

## Local Development

```bash
npm install
npm start        # Eleventy dev server with live reload
```

Build for production:

```bash
npm run build    # Outputs to _site/
```

---

## Deploy (Netlify)

Configured via `netlify.toml`:

- **Build command:** `npm run build`
- **Publish directory:** `_site`
- **Node version:** 18
- Clean URL rewrites for `/publications` and `/technical-review`

Push to the connected branch to trigger an automatic deploy.

---

## Form Setup (Google Apps Script)

1. Open Google Sheets and create a new spreadsheet
2. Go to **Extensions > Apps Script** (or create a new project at script.google.com)
3. Paste the contents of `apps-script.gs`, replacing the existing code
4. Save and click **Deploy > New deployment**
   - Type: **Web App**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Authorize the app when prompted
6. Copy the generated URL
7. In `src/assets/js/script.js`, replace `'COLE_A_URL_DO_APPS_SCRIPT_AQUI'` with the URL

Submissions are saved to a sheet tab named **"SIPOP Contacts"**, created automatically on the first submission. Email notifications are sent via `MailApp.sendEmail` — update the recipient addresses directly in `apps-script.gs`.

---

## Links

- 🌐 Website: [sipopscience.com](https://sipopscience.com)
- 💼 LinkedIn: [linkedin.com/company/sipop-science](https://www.linkedin.com/company/sipop-science/)
- 📷 Instagram: [instagram.com/sipopscience](https://www.instagram.com/sipopscience/)
- 📧 Contact: contact@sipopscience.com

---

## Development

**Design & Development:** Victor Leme  
**Client:** SIPOP / Gaspar Rogério da Silva Chiappa  
**Year:** 2026