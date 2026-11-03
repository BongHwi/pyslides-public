"""__TITLE__

Slides are Python objects (see AUTHORING.md in the PySlides repository). Build and present with
    python3 -m pyslides serve <this deck>
Every block, layout and step below is an example: replace the content, keep the shape."""
from __future__ import annotations

from pyslides import (Component, Deck, Slide, bullets, choose, component, equation, image, move, step, table,
                      text)

SLIDES: tuple[Slide, ...] = (
    # layout "title" is the Beamer [plain] title page: up to two text blocks, and one component or image
    # that becomes the title graphic on the right.
    Slide("title", "Introduction", "__TITLE__", "Subtitle · Conference · Place", (
        text("One or two sentences that state what the audience will take home."),
    ), "title"),

    Slide("motivation", "Introduction", "A frame title states the claim of the slide", "MOTIVATION", (
        bullets("Inline math such as $p_T$ or $\\sqrt{s_{NN}}$ and **bold** work in every text field.",
                "Write \\$ for a literal dollar sign.", "Third supporting point.", title="Block title"),
        equation(r"\frac{dN}{dy} = \int d^2b\, T_A(b)\, T_B(b)\, \sigma_{\mathrm{inel}}", "Equations are LaTeX, typeset by KaTeX."),
    ), "columns"),

    # "FIG n" at the start of the eyebrow numbers the captions: "Figure n:".
    Slide("figure", "Method", "Figures and tables carry Beamer captions", "FIG 1 · STATIC CONTENT", (
        image("example.svg", "Example figure from assets/", "Put png, jpg or svg files in assets/ and give the file name."),
        table(("quantity", "value", "unit"), ("radius", "6.70", "fm"), ("diffuseness", "0.55", "fm"), title="Example table"),
    ), "columns"),

    # An interactive component: its markup is registered in COMPONENTS, its behaviour lives in assets/deck.js.
    # Each step(...) is one presenter click; the slide plays all its steps before the next slide.
    Slide("live", "Method", "Clicks drive the controls during the talk", "FIG 2 · LIVE EXAMPLE", (
        component("wave-controls", "Wave parameters", "Drag a slider or press a button; the presenter clicks do the same."),
        component("wave-plot", "Live curve", "Drawn by assets/deck.js from the controls on the left."),
        text("Layout \"figure\": controls top-left, the figure on the right, this text bottom-left."),
    ), "figure", steps=(
        step(move("freq", 3)),
        step(choose("shape", "square"), move("amp", 0.5, 1.6)),
    )),

    Slide("summary", "Summary", "Summary", "SUMMARY", (
        bullets("Take-home message one.", "Take-home message two.", title="Summary"),
    ), "default"),
)

COMPONENTS = {
    "wave-controls": Component('''<div class="controls">
<label for="freq">frequency<output id="freqOut">1</output></label><input id="freq" type="range" min="1" max="6" step="0.1" value="1">
<label for="amp">amplitude<output id="ampOut">1.00</output></label><input id="amp" type="range" min="0.1" max="1" step="0.01" value="1">
<div id="shape" role="group" aria-label="shape" class="seg"><button aria-pressed="true" data-v="sine">sine</button><button aria-pressed="false" data-v="square">square</button></div>
</div>''', frame="block"),
    "wave-plot": Component('<svg id="wavePlot" class="chart" viewBox="0 0 640 360" role="img" aria-label="live curve"></svg>'),
}

DECK = Deck(
    slides=SLIDES,
    title="__TITLE__",
    lang="en",
    # Any key of pyslides/theme.py THEME: author, institute, short_institute, title_logos, colors.
    theme={"short_title": "__TITLE__", "date": "Conference, 2026"},
    components=COMPONENTS,
    scripts=("deck.js",),
)
