# SIPOP — Scientific Integrity and Publication Oversight Program

> **Scientific Rigor for Global Impact**

Institutional website for SIPOP, a program offering methodological auditing, technical review, and high-level mentorship for researchers aiming at global scientific publication.

Available in **English**, **Portuguese (pt-BR)**, and **Spanish**.

---

## Screenshots

### Home

| Light Mode | Dark Mode |
|---|---|
| ![SIPOP Home — Light Mode](screenshots/light.png) | ![SIPOP Home — Dark Mode](screenshots/dark.png) |

### Publications

| Light Mode | Dark Mode |
|---|---|
| ![SIPOP Publications — Light Mode](screenshots/light-publications.png) | ![SIPOP Publications — Dark Mode](screenshots/dark-publications.png) |

### Technical Review

| Light Mode | Dark Mode |
|---|---|
| ![SIPOP Technical Review — Light Mode](screenshots/light-technical-review.png) | ![SIPOP Technical Review — Dark Mode](screenshots/dark-technical-review.png) |

---

## About the Project

SIPOP is an institutional website built from the ground up, including brand identity, visual design, and front-end development. The project encompasses:

- Full brand identity (logo, color palette, typography, visual system)
- Canva template pack (10 templates for Instagram and LinkedIn)
- Social media content strategy and copywriting
- Paid ad campaigns (Instagram carousels)
- Website design and development
- Multilingual architecture (EN / PT-BR / ES), data-driven and built to scale to additional languages

---

## Tech Stack

- **Eleventy (11ty) v3** — static site generator with Nunjucks templating
- **Nunjucks (.njk)** — layouts, includes, macros, and page templates
- **HTML5** — semantic structure
- **CSS3** — custom properties, CSS variables for theming, responsive grid
- **Vanilla JavaScript** — no frameworks or dependencies
- **Google Apps Script** — serverless form handling, data stored in Google Sheets
- **Netlify** — build and hosting
- **Resend** — transactional email (first-contact email to new leads)
- **Google Fonts** — Inter typeface

---

## Features

- ✅ Fully responsive (mobile-first)
- ✅ Three-state theme toggle: light / dark / system preference
- ✅ Multilingual: English, Portuguese (pt-BR), and Spanish, with a globe-icon language switcher (flag + code) in the header
- ✅ `hreflang` + `canonical` tags on every page for multilingual SEO
- ✅ Contact form connected to Google Sheets via Apps Script, with per-language labels, country codes, and nationality suggestions
- ✅ WhatsApp Business, LinkedIn, and Instagram contact links in the footer, with a pre-filled greeting message per language
- ✅ Email notifications on form submission via MailApp
- ✅ 4-email remarketing sequence (every 7 days) for leads marked "Sem resposta", with one-click unsubscribe
- ✅ Automatic first-contact email to the lead (in their preferred language) via Resend, sent the moment the form is saved
- ✅ Smooth scroll navigation
- ✅ Background images swap between light/dark versions
- ✅ Semantic HTML with `aria-label` and `aria-live` attributes
- ✅ Multi-page, multi-language: Home, Publications, Technical Review, and Testimonials, each in 3 languages (12 routes total)
- ✅ No external JS dependencies

---

## Pages

Every page exists in three languages. English lives at the root; other languages live under a language-code subfolder (`/pt/`, `/es/`) — the internationally recognized pattern for multilingual SEO.

| Page | Template | English | Português | Español |
|---|---|---|---|---|
| Home | `src/index.njk` / `src/pt/index.njk` / `src/es/index.njk` | `/` | `/pt/` | `/es/` |
| Publications | `.../publications.njk` | `/publications` | `/pt/publications` | `/es/publications` |
| Technical Review | `.../technical-review.njk` | `/technical-review` | `/pt/technical-review` | `/es/technical-review` |
| Testimonials | `.../testimonials.njk` | `/testimonials` | `/pt/testimonials` | `/es/testimonials` |

---

## Internationalization (i18n)

The site uses a **data-driven i18n architecture**: page templates are written once and shared across all languages. Adding a language means adding data files — not touching `.njk` markup.

```
src/_data/
├── i18n/
│   ├── en.json          # all UI text — nav, footer, form, and every page's copy
│   ├── pt.json
│   └── es.json
├── publications.json    # the 9 publications — title/journal/abstract per language,
│                         # links and PDFs are language-independent
├── testimonials.json    # full testimonials list (name/org/role/quote per language,
│                         # plus category for the filter on /testimonials) — the Home
│                         # and Technical Review pages pull their own short quote sets
│                         # directly from i18n/{lang}.json instead
├── countryCodes.json    # phone country-code select, country names per language
└── nationalities.json   # nationality datalist, demonyms per language
```

**To edit existing text:** find the string in `src/_data/i18n/{lang}.json` (structured by section — `nav`, `footer`, `form`, `home`, `publications`, `technicalReview`, `testimonials`) and edit it directly. No rebuild logic needed beyond `npm run build`.

**To add a new language (e.g. French):**
1. Copy `src/_data/i18n/en.json` to `src/_data/i18n/fr.json` and translate every value (keep all keys identical).
2. Add an `"fr"` field to each entry in `countryCodes.json`, `nationalities.json`, and `publications.json`.
3. Create `src/fr/index.njk`, `src/fr/publications.njk`, and `src/fr/technical-review.njk`, copying the front matter from the equivalent `src/pt/*.njk` files and changing `lang: pt` to `lang: fr`.
4. Add the matching redirects to `netlify.toml` (see the `/pt/...` and `/es/...` blocks for the pattern).
5. Build. The language switcher, `hreflang` tags, and canonical URLs pick up the new language automatically — they loop over everything in `src/_data/i18n/`.

**Shared components** (contact form, publication card, testimonial card, language switcher) are Nunjucks macros in `src/_includes/macros.njk`, parameterized by the current language's text dictionary (`t`) and language code (`lang`) — written once, reused everywhere.

---

## File Structure

```
sipop/
├── .eleventy.js                 # Eleventy config — passthrough, dirs, engines
├── .eleventyignore               # Ignores node_modules and _site
├── .gitignore
├── netlify.toml                  # Build command, publish dir, clean URL redirects (EN/PT/ES)
├── package.json
├── apps-script.gs                # Google Apps Script — paste into Apps Script editor
├── remarketing.gs                # Remarketing sequence — second file in the same Apps Script project
├── README.md
│
├── src/                          # Eleventy input dir
│   ├── index.njk                 # Home (English)
│   ├── publications.njk          # Publications (English)
│   ├── technical-review.njk      # Technical Review (English)
│   ├── testimonials.njk          # Testimonials (English)
│   │
│   ├── pt/                       # Portuguese pages (thin — front matter + include)
│   │   ├── index.njk
│   │   ├── publications.njk
│   │   ├── technical-review.njk
│   │   └── testimonials.njk
│   │
│   ├── es/                       # Spanish pages (thin — front matter + include)
│   │   ├── index.njk
│   │   ├── publications.njk
│   │   ├── technical-review.njk
│   │   └── testimonials.njk
│   │
│   ├── _data/                    # Global data — translations and structured content
│   │   ├── i18n/
│   │   │   ├── en.json
│   │   │   ├── pt.json
│   │   │   └── es.json
│   │   ├── publications.json
│   │   ├── testimonials.json
│   │   ├── countryCodes.json
│   │   └── nationalities.json
│   │
│   ├── _includes/                # Nunjucks partials, layouts, and macros
│   │   ├── base.njk              # Base HTML layout (head, hreflang, scripts, slots)
│   │   ├── lp-header.njk         # Minimal header for landing pages
│   │   ├── navbar.njk            # Main navigation bar
│   │   ├── footer.njk            # Site footer (incl. WhatsApp/LinkedIn/Instagram)
│   │   ├── macros.njk            # Reusable components: contact form, publication
│   │   │                         # card, testimonial card, language switcher
│   │   └── content/              # Page content, shared across all languages
│   │       ├── home.njk
│   │       ├── publications.njk
│   │       ├── technical-review.njk
│   │       └── testimonials.njk
│   │
│   └── assets/                   # Static files — copied as-is to _site/assets/
│       ├── css/
│       │   ├── style.css             # Global styles, variables, theming, i18n components
│       │   ├── publications.css      # Styles for /publications
│       │   ├── technical-review.css  # Styles for /technical-review
│       │   └── testimonials.css      # Styles for /testimonials
│       ├── js/
│       │   ├── script.js             # Theme toggle, form handler, scroll, lang dropdown
│       │   ├── publications.js       # Publications page filter interactions
│       │   └── testimonials.js       # Testimonials page filter interactions
│       └── images/
│           ├── backgrounds/          # BG1, BG1DM, BG2, BG2DM (.webp)
│           ├── icons/                # Icon1–Icon7 (.webp)
│           ├── logo/                 # Logo1, Logo2 (.webp)
│           ├── favicon/              # Icon.ico
│           └── testimonials/         # suzana, ivan, katia, patricia, william,
│                                      # paulo, paula, joao (.webp)
│
├── screenshots/
│   ├── light.png                       # Home — light mode
│   ├── dark.png                        # Home — dark mode
│   ├── light-publications.png          # Publications — light mode
│   ├── dark-publications.png           # Publications — dark mode
│   ├── light-technical-review.png      # Technical Review — light mode
│   └── dark-technical-review.png       # Technical Review — dark mode
│
└── design-sources/                # Source files — not deployed
    ├── logo1.png
    ├── logo2.png
    ├── backgrounds/                # .png originals
    └── icons-source/               # .ai originals
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
- Clean URL rewrites for `/publications`, `/technical-review`, and their `/pt/...` and `/es/...` equivalents

Push to the connected branch to trigger an automatic deploy.

---

## Form Setup (Google Apps Script)

> **Note:** the live site already has this wired up — `src/assets/js/script.js` points to a deployed Apps Script Web App URL. The steps below are only needed if you're cloning this project to reuse it elsewhere (new spreadsheet, new deployment).

1. Open Google Sheets and create a new spreadsheet
2. Go to **Extensions > Apps Script** (or create a new project at script.google.com)
3. Paste the contents of `apps-script.gs`, replacing the existing code
4. Save and click **Deploy > New deployment**
   - Type: **Web App**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Authorize the app when prompted
6. Copy the generated URL
7. In `src/assets/js/script.js`, replace the `APPS_SCRIPT_URL` constant with your new URL

Submissions are saved to a sheet tab named **"SIPOP Contacts"**, created automatically on the first submission. Email notifications are sent via `MailApp.sendEmail` — update the recipient addresses directly in `apps-script.gs`. The hidden `source` field and UTM fields on the Technical Review form let you distinguish landing-page leads and campaign traffic in the sheet; the `preferredLanguage` and `source` values are kept in English across all site languages so responses stay consistent for filtering.

---

## First-Contact Email (Resend)

When a lead is saved, `netlify/functions/submit-form.js` immediately sends them a welcome email through the [Resend](https://resend.com) API. The text (PT / EN / ES, chosen from the form's `preferredLanguage`) lives in `netlify/emails/first-contact.js` — edit the `COPY` blocks to change it.

Setup:

1. In Resend, add and verify the sending domain (`sipopscience.com`) by adding the DNS records it shows.
2. Create an API key with **Sending access**.
3. In Netlify → Site configuration → Environment variables, set:
   - `RESEND_API_KEY` — required; without it the email is skipped (the lead is still saved)
   - `RESEND_FROM` — optional, default `SIPOP <contact@sipopscience.com>`
   - `RESEND_REPLY_TO` — optional, default `contact@sipopscience.com`
4. Redeploy.

A Resend failure never breaks the form: the lead is already in the sheet, and the error shows up in the function logs (Netlify → Logs → Functions → `submit-form`). Repeated submissions of the same lead reuse an idempotency key, so the lead doesn't get the email twice.

## Remarketing Sequence (Apps Script + Resend)

`remarketing.gs` sends a 4-email sequence to leads whose **Status** is `Sem resposta`. It runs once a day from a time-driven trigger:

| Email | When | Topic |
|---|---|---|
| 1 | 7 days after the lead came in (Date column) | Follow-up: is the research still on the agenda? |
| 2 | 7 days after email 1 | Social proof: testimonials and publications |
| 3 | 7 days after email 2 | Why good manuscripts get rejected + Technical Review |
| 4 | 7 days after email 3 | Last email: closing the request, door left open |

- Columns are found by header name (Date, Name, Email, Preferred Language, Status), like `apps-script-details.gs`, so added or moved columns don't break it.
- Language follows the Preferred Language column. The texts live in `REMARKETING_COPY` at the top of `remarketing.gs`.
- Progress is stored in two columns the script creates at the end of the sheet: `Remarketing (etapa)` (step sent, 1–4) and `Remarketing (último envio)` (date of the last send).
- Changing the Status stops the sequence; switching back to `Sem resposta` resumes it where it stopped.
- Every email has an unsubscribe link (signed with an HMAC, handled by `doGet`). Unsubscribed leads get `Descadastrado` in `Remarketing (etapa)` and never receive another email.
- A Resend failure doesn't advance the step, so the email is retried the next day.

Setup:

1. In the Apps Script project (the one bound to the sheet), add a second file named `remarketing.gs` and paste the code.
2. Project Settings → Script Properties → add `RESEND_API_KEY`.
3. Run `setupRemarketingTrigger()` once and authorize it (creates the daily trigger at 9 AM).
4. Deploy a new version of the Web App (Deploy → Manage deployments → edit → New version) so the unsubscribe link works. The URL doesn't change.
5. Optional: run `previewRemarketing()` to see in the log who would get which email today, without sending anything, and `sendRemarketingTest()` to receive all 4 emails at the test address.

## Links

- 🌐 Website: [sipopscience.com](https://sipopscience.com)
- 💼 LinkedIn: [linkedin.com/company/sipop-science](https://www.linkedin.com/company/sipop-science/)
- 📷 Instagram: [instagram.com/sipopscience](https://www.instagram.com/sipopscience/)
- 💬 WhatsApp: [wa.me/5551935001294](https://wa.me/5551935001294)
- 📧 Contact: contact@sipopscience.com

---

## Development

**Design & Development:** Victor Leme  
**Client:** SIPOP / Gaspar Rogério da Silva Chiappa  
**Year:** 2026
