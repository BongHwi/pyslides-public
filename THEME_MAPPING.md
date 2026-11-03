# Theme mapping

The default theme follows the Beamer Singapore theme with the seagull color theme. The HTML frame uses numbers measured from a rendered Beamer build of that theme at 1600 px width. No Beamer or TeX source is included in this repository.

The color values of the default theme (the red, dark gray, light gray and teal tokens and their dark and muted variants) correspond to the color definitions of the Beamer theme `beamerthemehsrm` (Copyright (c) 2013-2014 Benjamin Weiss, GNU General Public License). Only the numeric values are used; no code from that theme is included. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

| Beamer element | Measured at 1600 × 900 | HTML |
|---|---|---|
| Singapore headline fade + miniframes | `#d1cfce` → white over 126 px; section names with one dot per frame | Replaced by a segmented section progress bar (`nav.sections`): one 5 px track per section, width ∝ frame count; done sections `#46413c`, the current section fills in teal up to the current frame, later sections `#e3e1df`. A click on a track slice opens that frame; a click on a label opens the section start |
| Frametitle / framesubtitle | centred, medium weight, `#46413c` | `.frametitle h1` 48 px, `.framesubtitle` 26 px |
| Body text | light weight, black | `.text-block` 30 px. The default font is Pretendard (Light and Medium) for Latin and Korean, and Japanese uses LINE Seed JP (Regular for 300–400, Bold for 500–700; the family has no Light/Medium). `lang="ja"` content puts LINE Seed JP before Pretendard. The fonts are replaceable through a profile (`f_body`, `font_body` and an `@font-face` in `assets/profile.css`; see AUTHORING.md) |
| itemize marker | ► in `#46413c` | `.text-block li::before` triangle |
| enumerate | `1.` in structure colour | `.layer-grid` counter |
| block / block body | `#cccccc` / `#e5e5e5`, light-weight title | `.beamer-block` (titled text blocks and control panels) |
| alert / example block | `#96000f`/`#e10019`, `#006450`/`#009682` | `--alert-dark`, `--alert`, `--teal-dark`, `--teal` tokens |
| caption | `Figure n:` label in `#46413c`, text black | `.figure-caption`; the number comes from the slide's `FIG n` subtitle |
| booktabs table | heavy top/bottom rule, light midrule | `table` borders |
| Display math | Computer Modern | KaTeX 0.16.22 (vendored in `static/vendor/katex`) typesets the LaTeX source from `deck.py` |
| Footline | `#d1d0ce`, 47 px; author (institute) / short title / date n / N at .333/.222/.444 width | `.footline` |
| Title page (`frame[plain]`) | logos top left, title, subtitle, author, institute, date; title graphic on the right | `layout="title"`: the title graphic is a component or image on the right; headline and footline are hidden. Without logos, author, institute or date there is no box or line for them |
| Frame alignment | content vertically centred (`[c]`) | `.slide-body{align-content:center}` |

`pyslides/theme.py` holds the colours, the fonts and the talk metadata (author, institute lines, short institute for the footline, short title, date, title-page logos). The metadata defaults are empty; set them in `Deck.theme` or in a profile. `pyslides/build.py` injects the colour tokens and builds the section progress bar. Blue, orange and green distinguish proton, neutron and mixed channels; red is reserved for alert content. Inactive frames are hidden and inert. Navigation symbols are disabled in the Beamer build, so the previous/contents/fullscreen buttons stay invisible until the pointer or focus reaches the bottom-right corner.
