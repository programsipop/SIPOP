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
- ✅ Call scheduling: the researcher sets available slots, the lead books from a personal link, a Google Meet is created, and confirmation + reminders (24h / 2h) go out automatically
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
├── whatsapp-first-contact.gs     # First-contact WhatsApp — same Apps Script project
├── agenda.gs                     # Call scheduling backend — same Apps Script project
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

## First-Contact WhatsApp (Apps Script + Evolution API)

`whatsapp-first-contact.gs` sends each new lead a WhatsApp message inviting them to schedule a call, from the SIPOP number connected to a self-hosted [Evolution API](https://doc.evolution-api.com) (v2) instance. A time-driven trigger checks the sheet every 5 minutes.

- Sent 30 minutes after the form (the first-contact email goes out immediately), Monday to Friday, 9:30 AM to 6 PM Brasília time. Leads arriving outside that window get it at 9:30 AM on the next business day.
- Language follows the Preferred Language column. The texts live in `WHATSAPP_COPY` at the top of the file.
- The result is stored in a `WhatsApp (primeiro contato)` column the script creates: the send date/time, or `Sem WhatsApp`, `Duplicado` (phone already messaged in another row), `Ignorado (status)` (the team already filled in Status) or `Expirado` (lead waited more than 100 hours). A row with that cell filled is never processed again.
- Only leads that arrive after `setupWhatsAppTrigger()` is first run are messaged. Older leads are never touched.
- An Evolution API failure leaves the cell empty, so the send is retried on the next run.

Setup:

1. Run Evolution API v2 on a server and connect an instance to the SIPOP WhatsApp number (QR code).
2. In the Apps Script project, add a file named `whatsapp-first-contact.gs` and paste the code. Also update `apps-script.gs` (phone formatting fix for non-Brazilian numbers) and deploy a new version of the Web App.
3. Project Settings → Script Properties → add `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE` and, optionally, `WHATSAPP_TEST_NUMBER` (your own number with country code).
4. Run `sendWhatsAppTest()` and check the message on your phone.
5. Run `setupWhatsAppTrigger()` once and authorize it. `previewWhatsAppFirstContact()` logs who would be messaged right now without sending; `removeWhatsAppTrigger()` turns the automation off.

Evolution API is an unofficial WhatsApp client: automated sends carry a risk of the number being restricted by Meta. The script keeps volume low (one message per lead, typing delay, spaced sends, at most 10 per run).

## Call Scheduling (Apps Script + Google Meet + Resend + Evolution API)

Leads book a call themselves from a link in the first-contact email and WhatsApp.

| Page | Who | What |
|---|---|---|
| `/agenda-admin` | Researcher | Marks the free 30-minute blocks (Brasília time), sets how far ahead leads can book (next 7 / 14 / 30 / 60 days or up to a specific date; default 14), call length and minimum notice. Lists booked calls and can cancel them. Protected by a password. |
| `/agendar/?t=TOKEN` | Lead | Shows only the slots the researcher marked, in the lead's own time zone and language (PT / EN / ES). Opening it with an active booking reschedules it. Without a token it asks for name, email and WhatsApp. |
| `/confirmar/?t=TOKEN` | Lead | Opened from the 24h reminder: a green **CONFIRMAR** button and a red **REAGENDAR** button (which opens `/agendar`). |

Flow:

1. Every new lead gets a token (column `Agendamento (token)` in the contacts sheet). The Apps Script returns it to `submit-form`, which puts the personal link in the first-contact email; `whatsapp-first-contact.gs` puts the same link in the WhatsApp message (and skips leads who already booked — `Já agendou`).
2. When the lead picks a slot, `agenda.gs` records it in the **Agenda** tab (one row per booking) and in the `Call agendada` column of the contacts sheet, and creates a Google Calendar event with a Google Meet link on the calendar of the account that runs the script. The team gets an email.
3. Right away the lead gets a confirmation by email (Resend) and WhatsApp (Evolution API) with the meeting link.
4. 24 hours before: WhatsApp reminder asking for explicit confirmation, with the `/confirmar` link.
5. 2 hours before: short WhatsApp reminder with instructions and the meeting link.

Steps 4 and 5 are WhatsApp-only and run from a 5-minute trigger (`runAgendaReminders`). A call booked less than 24h (or 2h) ahead skips the corresponding reminder (`Dispensado`). A failed send leaves the cell empty and is retried on the next run. Rescheduling keeps the same row and Meet link, frees the old slot and restarts confirmation and reminders.

The pages talk to the Apps Script through `netlify/functions/agenda.js`; all rules live in `agenda.gs`. Availability is stored in the **Disponibilidade** tab (one row per day: date and the start time of each free 30-minute block) and can also be edited by hand. Message texts are in `AGENDA_COPY` at the top of `agenda.gs`; page texts are in `src/assets/js/agenda.js`.

Setup:

1. In the Apps Script project, add a file named `agenda.gs` and paste the code. Update `apps-script.gs` and `whatsapp-first-contact.gs` with the versions from this repo.
2. In the Apps Script editor: **Services (+)** → add **Google Calendar API** (identifier `Calendar`). This is what creates the Meet link.
3. Project Settings → Script Properties → add `AGENDA_ADMIN_KEY` (the panel password; make it long) and, optionally, `AGENDA_FALLBACK_LINK` (a fixed meeting link used if Meet creation fails). `RESEND_API_KEY` and `EVOLUTION_*` are already there.
4. Run `testAgendaMeet()` (creates and deletes a test event, logs the Meet link) and then `setupAgendaTrigger()` once, authorizing Calendar access.
5. Deploy a new version of the Web App (Deploy → Manage deployments → edit → New version). The URL doesn't change.
6. Deploy the site, open `/agenda-admin`, enter the password and mark the available slots.

Notes: cancelling from the panel does not message the lead (only Google Calendar sends its own cancellation notice). If Meet creation fails, the booking is still recorded and the team email says so. To use Zoom instead of Meet, replace `agendaUpsertMeeting_` in `agenda.gs` with a call to the Zoom API (requires a Zoom Server-to-Server OAuth app).

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
