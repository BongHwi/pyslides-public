# Slide authoring guide

Korean version: [AUTHORING.ko.md](AUTHORING.ko.md)

A PySlides talk is one Python file (`deck.py`) and the talk's `assets/` folder. The engine builds them into a 16:9 HTML deck styled after the Beamer Singapore theme with the seagull color theme. Personal settings such as the author name, institute and logos can live in a [profile](#profiles), separate from the deck files.

## Deck folder layout

```
decks/<name>/
  deck.py          # DECK = Deck(...)  (required). It may import other .py modules from the same folder
  assets/          # images and deck-specific JS/CSS, copied as-is to the build root (/)
    deck.js        # interactive plugin (optional)
  build/           # build output (ignored by git)
  export/          # PDF and check results (ignored by git)
```

- `python3 -m pyslides new <name>` copies `templates/new-deck/` to create this layout. The template has an example of every block kind, inline math, a figure, a table, an interactive component and click steps.
- Use only letters, digits, `.`, `_` and `-` in `<name>`. An argument that contains `/` or starts with `.` or `~` is treated as a path, not a name, and may point to a folder outside `decks/`.
- Files in `assets/` cannot overwrite engine files (`theme.css`, `fonts/…`, `vendor/…`, `index.html` and so on). Sub-folders such as `logos/` are free to use.
- Symlinks are not allowed. The build fails if the `assets` folder itself is a symlink or if it contains a symlink, so copy the files instead.

## Deck

```python
DECK = Deck(
    slides=SLIDES,                 # presentation order
    title="Browser tab title",
    lang="en",                     # ko, en, ja
    theme={"short_title": "...", "date": "..."},   # overrides any key of pyslides/theme.py THEME (wins over the profile)
    components=COMPONENTS,         # interactive markup of this deck
    scripts=("deck.js",),          # ES module plugins in assets/
    styles=("deck.css",),          # extra CSS in assets/
    layouts=("wide",),             # only when deck.css defines .layout-wide
)
```

`lang` sets `<html lang>` and also the language of the text the engine puts on screen itself: the previous, contents, fullscreen and next buttons, the close button, aria labels and the speaker-notes label. `ko` (the default), `en` and `ja` are supported, and a regional code such as `en-US` is matched by its first part. Any other value uses the English text. The text table is in `pyslides/ui.py`. The `Figure` and `Table` words in captions are English regardless of the language.

The `theme` keys you change most often are listed here. All defaults are empty.
- `author`: the presenter. Write co-presenters in the same string.
- `institute`, `short_institute`: the affiliation. `institute` is a tuple with one line per entry. A single string is also accepted, and blank entries are skipped. `short_institute` appears in the left cell of the footer as `author (short_institute)`.
- `title_logos`: paths of the title-page logos, for example `"logos/a.svg"` for a file under the deck's `assets/`.
- `short_title`, `date`: shown in the footer.

An empty value draws nothing in its place. The left footer cell shows `author (short_institute)` only when both are set, the one that is set when only one is, and nothing when neither is. The title page makes no logo box when there are no logos, and no empty author, institute or date line. Without logos the title block therefore sits about 66 px higher than with logos. To avoid repeating your name and affiliation in every deck, use a [profile](#profiles).

## Slide

```python
Slide(id, section, title, eyebrow, blocks, layout="default", notes="", steps=())
```

- `id`: ASCII letters, digits and hyphens only. The URL `#id` goes straight to the slide. Keep the id when you reorder slides. The build fails if it collides with an element id inside a component (such as `freq`).
- `section`: the segment of the progress bar at the top. Use the same name for consecutive slides.
- `title`: the frametitle. Write the claim of the slide as a sentence, not a topic.
- `eyebrow`: the framesubtitle. If it starts with `FIG n · ...`, the caption of the figure on that slide becomes `Figure n:`.
- `notes`: goes into the HTML only and is not shown on screen.

### Text markup

These can be used in every text field: title, eyebrow, text, bullets, block titles, captions, table cells, layers and comparison.
- `$p_T$`: KaTeX inline math
- `**bold**`: bold text
- `**bold**{.class}`: bold text with a CSS class. Define the class in the deck's stylesheet, and write several as `{.a .b}`. The name must start with a letter or `_`, otherwise `{...}` appears literally.
- `\$`: a literal dollar sign. Inside a Python string write `"\\$"` or `r"\$"`.

All other characters are HTML-escaped. The build fails when the number of `$` is odd. Other inline formatting such as links or colors is made with component HTML.

### Blocks

| Function | Result |
|---|---|
| `text("...", title="")` | A paragraph. With a title it becomes a Beamer block |
| `bullets("a", "b", title="")` | A ► list. With a title it becomes a block |
| `equation(r"\frac{a}{b}", caption="")` | KaTeX display math. Environments such as `gathered` work |
| `image("plot.png", "Title", "Description", height=0)` | A figure from `assets/` with a `Figure n:` caption. height (px) sets the maximum height; the default is 560 |
| `table(("col1","col2"), ("a","1"), ..., title="")` | A booktabs table. With a title it gets a `Table:` caption |
| `layers("…", "…", "…")` | Numbered step cards |
| `comparison("…", "…")` | Side-by-side comparison cards |
| `component("name", "Title", "Description", figure="")` | Interactive markup registered in `Deck.components`. `figure` is the id given to the placeholder `<div>` of a component whose html is empty |

- `image()` accepts only formats a browser can show (png, jpg, gif, svg, webp, avif).
- Convert PDF or EPS figures from a Beamer manuscript first, for example `pdftoppm -png -r 200 -singlefile fig.pdf fig` or `inkscape fig.pdf -o fig.svg`.
- Naming a file that does not exist fails the build.
- `Block` is the dataclass these functions return. `validate_slides(slides, components, layouts)` runs the same checks that the build runs, and you can call it yourself on a slide tuple.

### Layouts

| layout | Arrangement |
|---|---|
| `title` | The title page. At most two text blocks, placed on the left. One component or image is allowed and becomes the title graphic on the right. Any other block is a build error |
| `default` | One column, vertically centred like Beamer |
| `columns` | Two columns |
| `rows` | One column, centred (for wide equations) |
| `figure` | Block 1 top left, block 2 (the figure) filling the right, block 3 bottom left |
| `figure-left` | A wide left column (1.4) and a narrow right column (1) |

- Any other name is a build error. For a new arrangement, define `.layout-<name>` in the deck CSS and list the name in `Deck.layouts`.
- A slide is a 1600×900 canvas that does not scroll, so overflowing content is cut off. `python3 -m pyslides check <deck>` finds overflow.

## Interactive components

Register the markup in `deck.py` and write the behaviour in `assets/deck.js`.

```python
COMPONENTS = {
    "wave-controls": Component('<label for="freq">frequency<output id="freqOut">1</output></label>'
                               '<input id="freq" type="range" min="1" max="6" step="0.1" value="1">', frame="block"),
    "wave-plot": Component('<svg id="wavePlot" class="chart" viewBox="0 0 640 360"></svg>'),
}
```

- `frame`: the frame around the component.
  - `"figure"` (default): gets a `Figure n:` caption.
  - `"table"`: gets a `Table:` caption.
  - `"block"`: becomes a titled Beamer block.
  - `"titlegraphic"`: placed on the right of the title page.
- `status=True`: puts a live-calculation status line next to the frametitle.
- `runtime_ids`: ids of elements that the JS creates later. Registering them here lets `press()` and `move()` target them.
- An id must be unique in the whole document, so using the same component on two slides fails the build. To show the same graph again, register another component with different ids.

The plugin (`assets/deck.js`) is an ES module that exports the functions below. All of them are optional.

```js
import { slider, segmented } from "/controls.js";   // helpers provided by the engine
export function init({ exportMode, slides }) {}     // called once. Wire up events here
export function onShow(slide) {}                    // called every time the slide changes
export function isSettled() { return true; }        // PDF and check wait until this is true
export function saveState(slide) { return {...}; }  // for undoing steps: save state kept outside the controls
export function restoreState(slide, saved) {}       // restore from the value saveState returned
```

- `slider(id, onInput, format)`: shows the value of a range input in `<output id="{id}Out">` and calls `onInput(number)`.
- `segmented(id, onChange)`: keeps exactly one button of a group with `data-v` and `aria-pressed` pressed.
- When `init` runs, the other slides are `display:none`. Elements on them measure 0×0, so do work that depends on size in `onShow`.
- When `exportMode` is true the page is being captured for PDF or check. Stop animations then.
- The `isSettled()` contract: if there is asynchronous work (a worker, a fetch), return false immediately, in the same place that receives the control's `input` event. Return true again when the work finishes. The capture checks this value right after it runs a step.
- If one plugin fails to import, the rest of the deck still works. The failure appears as an error in the console and in `check`.
- Scripts are loaded only as ES modules. UMD bundles (plain `<script>`) are not supported. If you need a chart library, put its ESM build in `assets/` and import it as `/file.js`, or draw the SVG yourself as the template does.
- Three.js (`/vendor/three/three.module.js`, `OrbitControls.js`) and KaTeX are built in. Working examples of 3D, a live calculation and a worker are in `decks/demo/assets/`.

## Keys during the talk

Keys act while the focus is in the slide area. When a control such as an input, button or slider has the focus, that control receives the keys (Escape is the exception). Keys pressed together with Ctrl, Alt or Meta are ignored.

| Key | Action |
|---|---|
| →, PageDown, Space | Run one remaining step. With no steps left, go to the next slide |
| ←, PageUp, Backspace, Shift+Space | Undo one step. In the initial state, go to the previous slide |
| Home | Go to the first slide |
| End | Go to the last slide |
| F (either case) | Toggle fullscreen. Same as the on-screen fullscreen button |
| Escape | Close the contents. Close an open table. If neither is open, return the focus to the slide area |

## Click steps (steps)

There is no time to operate controls during a talk, so the presenter's clicks move the controls instead.

```python
Slide(..., steps=(
    step(move("freq", 3)),                                  # click 1: move the slider to 3 over 1.2 seconds
    step(choose("shape", "square"), move("amp", 0.5, 1.6)), # click 2: two actions at once
))
```

| Function | Action |
|---|---|
| `move(id, value, seconds=1.2)` | Move a range input smoothly. It sends `input` events while moving and a `change` event at the end |
| `choose(group id, data-v)` | Press one button of a button group |
| `press(button id)` | Press a button |
| `click("CSS selector")` | Click the element of the slide that matches the selector. Use it for checkboxes and similar |

- `step(...)` groups actions into one click and returns an `Action` list for `Slide.steps`. `Action` is the dataclass that `move`, `press`, `choose` and `click` produce.
- →, Space and PageDown run the remaining steps first. They go to the next slide only after all steps have run.
- PageDown and PageUp are the clicker keys. They advance steps even when the focus is on a slider or button, and they return the focus to the presentation. The other keys go to a control that has the focus.
- ← undoes one step at a time. The state just before each step is saved and restored exactly, so no earlier step is run again.
  - Sliders, checkboxes, selects, input fields and `aria-pressed` buttons are restored.
  - `input` and `change` events are sent on restore too.
  - Button groups and toggle buttons are restored first, then sliders and input fields. Even when a button handler changes the `max` of a slider or resets its value, the saved value comes back.
  - A button group (`.seg`) presses only the button that was pressed originally.
  - State kept outside the controls (for example a counter raised by an "add" button) is restored through the plugin's `saveState` and `restoreState`.
- Going back to an earlier slide shows it in its last-step state. Entering it again starts from the initial state.
  - The initial state is saved the first moment the slide is entered. If you only touch the controls without running any step and leave, the initial state comes back on re-entry.
- Touching a control by hand during an animation stops the animation where it is.
- The build fails in these cases.
  - A `move` target is not a range input.
  - The `#id` or `data-*="value"` of `press`/`choose`/`click` is not in the slide's markup.
  - An id cannot be used as a selector, for example one that starts with a digit.
- Other CSS selectors are first checked in the browser. A wrong selector skips only that step and logs an error to the console, and `check` reports it as an error.
- The PDF has one page per slide and per step.

### Dial (grab and turn)

`Slide(..., dial="id")` makes one range input or one `<video>` of the slide the dial target. A working example is in `decks/demo`. The Kinesis "slide scrub" dial sends F17 (forward) or F16 (back) for each notch the wrist turns. If you use these two keys as shortcuts or in a key-remapping tool (Karabiner and the like), the dial will not work.

- A range input moves by its own `step` and stops at `min` and `max`. With `step="any"` it moves by 1/100 of the range. Every move sends `input` and `change` events, so a figure wired to the slider follows.
- A `<video>` stops at the first frame and moves forward or back by `data-dial-step` seconds (default 0.08 s) per notch. The dial gives at most about 12.5 notches per second, so turning quickly plays at nearly real speed and turning the other way plays in reverse.
  - Reverse playback repeats seeking. A video with distant keyframes stutters going backward. Re-encode with every frame as a keyframe: `ffmpeg -i in.mp4 -c:v libvpx-vp9 -g 1 -an out.webm`
  - Put the video in `assets/` and write it in the Component markup like `<video id="clip" src="clip.webm" muted playsinline preload="auto"></video>`.
- A value changed by the dial is the same as one changed by hand. It stops a running step animation, and ← or PageUp returns to the state before that step. The step state includes the video's playback position and whether it is playing.
- On a slide with no dial target, F17/F16 do nothing. If the target id is not a range input or video of the slide, the build fails.

## Profiles

A profile is personal configuration shared by several decks: your name, affiliation, logos, fonts and colors, kept outside the deck files. The public repository holds no personal data, and your own decks get their look by attaching a profile.

```
my-profile/
  profile.json          # required. A JSON object
  assets/               # optional. Logos, fonts, anything. Copied to the build root (/)
    profile.css         # optional. When present it is linked automatically after theme.css and before the deck's styles
    logos/mark.svg
```

```json
{
  "author": "Your Name",
  "institute": ["Your Institute", "Your City"],
  "short_institute": "YI",
  "title_logos": ["logos/mark.svg"]
}
```

- Choose a profile with the environment variable `PYSLIDES_PROFILE=<folder>` or with `--profile <folder>` on `build`, `serve`, `check` and `pdf`. If both are given, `--profile` wins. An empty or whitespace-only value counts as not given, so `--profile ""` falls back to `PYSLIDES_PROFILE`.
- A relative path is relative to the folder where the command runs (not the deck folder or the repository). `~` expands to the home folder.
- Value precedence is `THEME` (`pyslides/theme.py`) < profile < `Deck.theme`.
- Use only keys that exist in `THEME` in `pyslides/theme.py`. `institute` and `title_logos` take a string or an array of strings, `canvas_width` and `canvas_height` take integers, and all others take strings.
- The profile's `assets/` is copied into the same build root as the deck's `assets/`. `"logos/mark.svg"` in `title_logos` resolves to `/logos/mark.svg`.
- With no profile (or with no `assets/profile.css`), no profile-related `<link>` or file is in the build.
- The build fails with exit code 1 and a message on stderr in these cases.
  - The profile folder or `profile.json` is missing, or it is not JSON or not an object.
  - There is an unknown key (the message lists the valid keys) or a value of the wrong type.
  - A file in the profile's `assets/` would replace an engine file.
  - A file in the deck's `assets/` would replace a file of the profile.
  - The profile's `assets` folder or a file inside it is a symlink.
- To change the font, set `f_body` and `font_body` in `profile.json` and declare the `@font-face` in `assets/profile.css`. Put the font files you obtained yourself in the profile's `assets/`. For Japanese text, the engine's own `:lang(ja)` rule names LINE Seed JP and Pretendard directly and ignores `--f-body`, so override `:lang(ja){font-family: ...}` in `profile.css`.

## Commands

```bash
python3 -m pyslides --help                        # every subcommand has --help
python3 -m pyslides new <name> [--title "..."]   # create decks/<name> (a path creates it there)
python3 -m pyslides list
python3 -m pyslides serve <name> [--port 8765] [--no-browser] [--profile DIR]   # --port 0 picks a free port
python3 -m pyslides build <name> [--profile DIR]  # if a server is already running, rebuilds and reloads the browser
python3 -m pyslides check <name> [-o OUTPUT] [--profile DIR]   # capture every slide and step; check overflow, LaTeX errors and JS errors → export/check/index.html
python3 -m pyslides pdf <name> [-o OUTPUT] [--scale 2] [--vector] [--profile DIR]   # export/<name>.pdf
```

- `-o`, `--output`: for `check`, the result folder (default `<deck>/export/check`). For `pdf`, the PDF file (default `<deck>/export/<name>.pdf`).
- `--scale`: the pixel density of the PDF pages (default 2). `1` gives a smaller file.
- `--vector`: see [PDF export](#pdf-export) below.
- `--profile`: see [Profiles](#profiles). The default is the environment variable `PYSLIDES_PROFILE`.
- `check` and `pdf` need Node.js 18 or newer, `npm ci` and `npx playwright install chromium`. Presenting needs only Python 3.11 or newer.

## PDF export

The default PDF holds a screen-captured image, one page per slide and per step. Its text cannot be searched or copied.

`pdf --vector` makes a PDF with selectable, searchable text. Figures stay vector and links stay PDF links. `<canvas>` and WebGL (for example Three.js) are embedded as an image at the `--scale` density, element by element.

- The monospace and symbol fonts that the engine bundles (DejaVu) are embedded.
- When the embedded-font check finds a host font, it prints `WARNING host fonts embedded (output differs between machines): ...`. The PDF may then look different on different computers. The check needs `pdffonts` (poppler-utils).
- A font that the browser reports as an `@font-face` font (the engine's, the deck's or the profile's) is not counted as a host font. However, an `@font-face` declared with `src: local(...)` uses a font of the host, and this check cannot verify it. Use declarations that load the font file with `url(...)`.
- Text inside an SVG shown through `image()` is drawn as an `<img>` and may use host fonts. That text is checked with `pdffonts` and gives the same warning.

## Known limits

- The build writes every path as an absolute path starting with `/`, so it works only at a domain root. Putting it under a sub-path such as `/repo/` on GitHub Pages breaks it.
- The on-screen controls and accessibility labels follow `Deck.lang` (`ko`, `en`, `ja`); any other value gives English. The `Figure`/`Table` words in captions are always English.
- The default PDF is a screen capture and its text cannot be searched. Use `pdf --vector` when you need text. Even then `<canvas>` and WebGL stay images, and `src: local(...)` fonts are not verified by the host-font check.
- In `pdf --vector`, a `<pre>` element inside a block (`.block-body`) is set in the bundled math face (KaTeX_Main, a serif), so code written with `<pre>` looks serif in the vector PDF. If code must stay monospace, use a `div` with a monospace class instead, for example `font-family: "PySlides Mono"` as `div.code` does in `decks/demo`.
- An id may appear only once in the whole document.
