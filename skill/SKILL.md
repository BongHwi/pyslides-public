---
name: pyslides
description: Make, edit, check or export a talk with PySlides, a Python-authored interactive slide engine in Beamer style. Use when the user asks for slides or a deck (발표자료, 슬라이드, スライド) in the PySlides format, names PySlides or an existing PySlides deck, wants interactive slides driven by presenter clicks, or wants a PDF of such a deck. Do not use for PowerPoint (.pptx), Google Slides, or consulting-style business decks; for a generic slide request that names no format, ask whether PySlides is meant.
---

# PySlides

PySlides decks are Python (`decks/<name>/deck.py`) plus optional browser plugins (`assets/deck.js`).
The engine renders them in a Beamer Singapore / seagull style with Pretendard and LINE Seed JP fonts. Author name, affiliation, logos and fonts come from the deck's `theme` or from a profile (`PYSLIDES_PROFILE`, see `AUTHORING.md`).
The repository is the single source of truth for the engine, the decks and this skill.

## 1. Get the repository

The installer (`skill/install.sh`) fills in the two values below. If `PYSLIDES_REPO` is empty, the clone had no `origin` remote when the skill was installed.

```bash
PYSLIDES_HOME="${PYSLIDES_HOME:-__PYSLIDES_HOME__}"
PYSLIDES_REPO="__PYSLIDES_REPO__"
if [ -e "$PYSLIDES_HOME" ] && [ ! -d "$PYSLIDES_HOME/.git" ]; then
  echo "$PYSLIDES_HOME exists but is not a git clone"     # stop and ask the user; do not overwrite it
elif [ ! -d "$PYSLIDES_HOME" ]; then
  if [ -n "$PYSLIDES_REPO" ]; then git clone "$PYSLIDES_REPO" "$PYSLIDES_HOME"; else echo "no clone at $PYSLIDES_HOME and no repository URL recorded; ask the user"; fi
else
  git -C "$PYSLIDES_HOME" fetch --quiet && git -C "$PYSLIDES_HOME" status --short --branch
fi
```

- If the clone fails, the user may need to authenticate (for a private fork, `gh auth login`). Ask them, then try again.
- If the clone is clean and behind its upstream, run `git pull --ff-only`. If it has local changes or has diverged, do not pull, stash or reset. Report the state and work on top of it.
- Run every command below from `$PYSLIDES_HOME`. Python 3.11 or newer is enough to build and present.
- `check` and `pdf` also need Node.js 18 or newer and a Chromium for Playwright.
  - If `node_modules/` is missing, run `npm ci`.
  - Run `npx playwright install chromium` once per machine.
  - If Chromium still does not start, for example in WSL without system libraries, set `PYSLIDES_BROWSER_EXECUTABLE` to a working chromium binary, for example `~/.cache/ms-playwright/chromium-*/chrome-linux/chrome`.
  - If `npx playwright install-deps` is needed, it needs sudo, so ask the user.
- If Node.js is not available, build and present only. Tell the user that `check` and `pdf` were not run.

## 2. Read before writing

- Read `AUTHORING.md` completely. It lists every block, layout, theme key, inline markup, component option, plugin hook, step action and known limit.
- Read `templates/new-deck/deck.py` and `templates/new-deck/assets/deck.js`. They are the smallest complete deck.
- For 3D, a live calculation, a worker, a dial or many charts, read the matching part of `decks/demo/` (`deck.py` and the files in `assets/`) and copy its patterns.
- Run `python3 -m pyslides list` to see the existing decks. When the user names an existing talk, edit that deck instead of making a new one.

## 3. Plan the talk with the user's material

- Content comes from the user: a paper, notes, an old Beamer `.tex`, figures or data. Do not invent results, numbers or references. Ask when the source is missing.
- Write the outline as sections, then one slide per claim. Ask the user only for choices the material cannot answer, such as length, audience and language.

## 4. Make and write the deck

```bash
python3 -m pyslides new <kebab-name> --title "Talk title"
```

Default style. Keep it unless the user asks otherwise.
- The first slide uses `layout="title"`, with at most two text blocks and one component or image. Set `author`, `institute`, `short_institute` and `title_logos` in `Deck.theme`, or take them from the user's profile if `PYSLIDES_PROFILE` is set; they are empty by default. Set `short_title` and `date` in `Deck.theme`.
- The frame title states the claim of the slide as a sentence, not a topic word. The eyebrow is a short uppercase label, and it starts with `FIG n ·` on figure slides so that the captions are numbered.
- Use at most about five bullets, or two blocks plus one figure, per slide. Split a slide rather than shrink its text.
- Math:
  - Display math: `equation(r"...")`.
  - Inline math: `$...$` inside any text, and `**bold**` for bold.
  - Write `\$` for a literal dollar sign.
  - When converting a `.tex` source, change `\textbf{}` to `**...**`. Drop other inline LaTeX commands, or move them inside `$...$`.
- Figures go in `assets/` and are shown with `image()`. Do not hotlink images. Convert PDF/EPS figures first, for example with `pdftoppm -png -r 200 -singlefile fig.pdf fig` or `inkscape fig.pdf -o fig.svg`.
- Interactive components:
  - Use them only when the change itself is the point.
  - Give each interactive slide one to three `step(...)` clicks, so that the talk shows the change without manual operation.
  - Step targets should be sliders, checkboxes or selection buttons. If a step presses a one-shot button, such as "add" or "run", the plugin must implement `saveState`/`restoreState` so that ← can undo it.
  - Give every element its own id. Slide ids, element ids and the components on different slides must not share an id.
- Write in the language of the user's request or of the source talk, and set `lang` in `Deck` to `ko`, `en` or `ja` to match. The bundled fonts cover Korean, Japanese and English.

## 5. Verify. This step is required.

```bash
python3 -m pyslides build <name>      # fails fast on wrong step targets, ids, $ balance, image types, layouts
python3 -m pyslides check <name>      # exit 0 required; writes export/check/index.html and check.json
```

- `check` captures every slide and every step. It fails on overflow, LaTeX errors, JavaScript errors and missing files.
- Fix each reported problem, then run `check` again.
- Then look at the screenshots in `decks/<name>/export/check/*.jpg`. Read a few images, or combine them into one contact sheet. Check balance, empty space, readability and figure size, because `check` does not measure these.
- After you change the engine (`pyslides/`, `static/`, `tools/`), also run `npm test` (it needs `pdffonts` and `pdftotext` from poppler-utils).
- Engine changes must stay general, so put talk-specific code in the deck.

## 6. Present and export

- Start the server in the background: `python3 -m pyslides serve <name> --no-browser`. The default port is 8765.
- If 8765 is busy, the server says so and exits. Use `--port 0`, which picks a free port, and read the URL from the `PySlides ready:` line. Give the user that URL.
- After later edits, run `python3 -m pyslides build <name>` and ask the user to reload the browser. Do not start a second server.
- `python3 -m pyslides pdf <name>` writes `decks/<name>/export/<name>.pdf`, with one page per slide and per step. Use `--scale 1` for a smaller file. Add `--vector` for selectable text, vector figures and PDF links (`<canvas>`/WebGL stays an image).

## 7. Save

- Commit or push only when the user asks.
- A deck lives in `decks/<name>/`, and `build/` and `export/` are ignored by git.
- When this skill changes, edit `skill/SKILL.md` in the repository and run `skill/install.sh`.

Report the deck path, the slide and step counts, the `check` result, and the URL or PDF path.
