# SIPOP — Scientific Integrity and Publication Oversight Program

> **Scientific Rigor for Global Impact**

Institutional website for SIPOP, a program offering methodological auditing, technical review, and high-level mentorship for researchers aiming at global scientific publication.

---

## Screenshots

### Light Mode
![SIPOP Hero — Light Mode](screenshots/hero-light.png)
![SIPOP Services — Light Mode](screenshots/services-light.png)
![SIPOP Testimonials & Contact — Light Mode](screenshots/contact-light.png)

### Dark Mode
![SIPOP Hero — Dark Mode](screenshots/hero-dark.png)
![SIPOP Services — Dark Mode](screenshots/services-dark.png)

> Screenshots to be added after deployment.

---

## About the Project

SIPOP is a one-page institutional website built from the ground up, including brand identity, visual design, and front-end development. The project encompasses:

- Full brand identity (logo, color palette, typography, visual system)
- Canva template pack (10 templates for Instagram and LinkedIn)
- Social media content strategy and copywriting
- Paid ad campaigns (Instagram carousels)
- Website design and development

---

## Tech Stack

- **HTML5** — semantic structure
- **CSS3** — custom properties, CSS variables for theming, responsive grid
- **Vanilla JavaScript** — no frameworks or dependencies
- **Google Apps Script** — serverless form handling, data stored in Google Sheets
- **Google Fonts** — Inter typeface
- **Formspree** *(previous)* → replaced by Google Apps Script for unlimited, cost-free submissions

---

## Features

- ✅ Fully responsive (mobile-first)
- ✅ Dark mode with system preference detection and localStorage persistence
- ✅ Contact form connected to Google Sheets via Apps Script
- ✅ Smooth scroll navigation
- ✅ Background images swap between light/dark versions
- ✅ Semantic HTML with `aria-label` and `aria-live` attributes
- ✅ No external JS dependencies

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
├── index.html          # Main HTML — structure and content
├── style.css           # All styles, CSS variables, dark mode, responsive
├── script.js           # Dark mode toggle, form handler, scroll behavior
├── apps-script.gs      # Google Apps Script — paste into Google Apps Script editor
├── Icon.ico            # Favicon
├── Logo1.webp          # Logo — color version (light mode)
├── Logo2.webp          # Logo — white version (dark mode / footer)
├── BG1.webp            # Hero background — light
├── BG1DM.webp          # Hero background — dark
├── BG2.webp            # About background — light
├── BG2DM.webp          # About background — dark
├── Icon1.webp          # Process icon: Submission
├── Icon2.webp          # Process icon: Review
├── Icon3.webp          # Process icon: Guidance
├── Icon4.webp          # Process icon: Validation
├── Icon5.webp          # Benefit icon: Validated Research
├── Icon6.webp          # Benefit icon: Methodical Guidance
└── Icon7.webp          # Benefit icon: International Standards
```

---

## Form Setup (Google Apps Script)

1. Open Google Sheets and create a new spreadsheet
2. Go to **Extensions > Apps Script**
3. Paste the contents of `apps-script.gs`, replacing the existing code
4. Save and click **Deploy > New deployment**
   - Type: **Web App**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Authorize the app when prompted
6. Copy the generated URL
7. In `script.js`, replace `'COLE_A_URL_DO_APPS_SCRIPT_AQUI'` with the URL

Submissions will be saved to a sheet named **"SIPOP Contacts"**, created automatically on the first submission. To enable email notifications for each new contact, uncomment the `MailApp.sendEmail` block in `apps-script.gs`.

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
**Year:** 2025
