"""PySlides demo: a feature tour of the slide engine, written with the engine.

Every slide shows one thing PySlides can do; the deck is the documentation of itself.
Interactive parts live in assets/: deck.js (plugin) wires lab.js (charts, worker), scenes.js and scene3d.js
(Three.js, with a static fallback where WebGL is missing). Everything is computed from fixed seeds."""
from __future__ import annotations

from pyslides import (Component, Deck, Slide, bullets, choose, click, comparison, component, equation, image, layers,
                      move, press, step, table, text)


SLIDES: tuple[Slide, ...] = (
    # 1. layout "title" with a Three.js title graphic (frame="titlegraphic").
    Slide("title", "Start", "PySlides", "Interactive slides, written in Python", (
        text("A deck is a Python file. The engine turns it into a presentation that runs in the browser, steps with a clicker, and exports to PDF."),
        text("This deck is built with PySlides and shows its features, one slide at a time."),
        component("hero", "", ""),
    ), "title", "Welcome. The sphere on the right is a live Three.js scene; where WebGL is missing it shows a static picture."),

    # 2. inline notation: $...$, **bold**, **bold**{.class}, \$
    Slide("markup", "Writing", "Text fields understand math, emphasis and literal dollars", "INLINE MARKUP", (
        component("markup-source", "You write", "Every text field takes the same notation."),
        bullets("Energy $E = mc^2$ is typeset inline.", "Fractions and indices work: $\\frac{a}{b}$, $x_i^2$.",
                "Use **bold** or **marked bold**{.hl} for emphasis.",
                "Write \\$5 for a literal dollar sign.", "Two classes: **both**{.hl .big}.", title="You get"),
    ), "columns", "Left: the source strings. Right: what the engine renders. The class .hl is defined in assets/deck.css."),

    # 3. equation() with gathered, layout "rows"
    Slide("equations", "Writing", "Display equations are typeset by KaTeX", "EQUATIONS", (
        equation(r"\begin{gathered}\hat f(\xi)=\int_{-\infty}^{\infty} f(x)\,e^{-2\pi i x\xi}\,dx \\ "
                 r"\int_{-\infty}^{\infty} e^{-x^2}\,dx=\sqrt{\pi}\end{gathered}", "Two lines in one gathered block."),
        equation(r"x(t)=e^{-\gamma t}\cos(2\pi f t)", "The damped oscillation that the sliders of the Interaction section draw."),
        text("Invalid LaTeX stays visible as red source, and **check** reports it."),
    ), "rows", "Layout rows centres a wide equation above its reading."),

    # 4. image() with an SVG, table(), FIG n captions
    Slide("figures", "Writing", "Figures and tables carry Beamer-style captions", "FIG 1 · IMAGES AND TABLES", (
        image("response.svg", "A damped step response", "Dashed line: target. Circles: seeded measurements. The drawing is plain SVG paths."),
        table(("property", "value", "unit"), ("curve points", "400", "–"), ("measurements", "24", "–"), ("target level", "1.00", "a.u."),
              ("overshoot", "0.37", "a.u."), title="Figure data"),
    ), "columns", "An eyebrow that starts with FIG n numbers the caption of the figure on that slide."),

    # 5. layers(), comparison()
    Slide("cards", "Writing", "Cards show a pipeline and a trade-off", "LAYERS AND COMPARISON", (
        layers("Write **deck.py** as plain Python data: slides, blocks, components.", "Build static HTML with the engine and the files in **assets/**.",
               "Present it in a browser, **check** every step, or export a PDF."),
        comparison("**In the browser:** live controls, 3D scenes, workers, clicker steps and a dial.",
                   "**In a PDF:** one page per step, selectable text, vector figures and linked contents."),
    ), "columns", "layers() numbers its cards; comparison() puts two cards side by side."),

    # 6. layouts: figure-left (also columns, rows, figure elsewhere)
    Slide("layouts", "Writing", "Six built-in layouts cover most slides", "FIG 2 · LAYOUT GALLERY", (
        component("layout-gallery", "Built-in layouts", "Teal boxes mark the slot a figure usually takes."),
        bullets("**title** and **default** open and fill a talk.", "**columns** and **rows** hold text and equations.",
                "**figure** and **figure-left** give a figure the room it needs.", title="Choose by shape"),
    ), "figure-left", "This slide itself uses figure-left: a wide left column and a narrow right column."),

    # 13. custom layout: Deck.layouts + deck.css
    Slide("triptych", "Writing", "A deck can define its own layout in a few lines of CSS", "CUSTOM LAYOUT", (
        component("step-css", "1 · Define it", "assets/deck.css"),
        component("step-register", "2 · Register it", "deck.py"),
        component("step-use", "3 · Use it", "deck.py"),
    ), "triptych", "The engine rejects unknown layout names, so a custom layout has to be declared in Deck.layouts."),

    # 12. Korean and Japanese samples
    Slide("scripts", "Writing", "Korean and Japanese text use their own fonts", "MULTILINGUAL TEXT", (
        component("sample-ko", "Korean", "Pretendard"),
        component("sample-ja", "Japanese", "LINE Seed JP"),
        text("Latin text and Korean use **Pretendard**. A Japanese passage marks itself with **lang=ja** and the engine switches to **LINE Seed JP**."),
    ), "columns", "Fonts are bundled with the engine, so the PDF looks the same on every machine."),

    # 7. slider + chart, move / choose steps
    Slide("sliders", "Interaction", "Sliders redraw a chart, and a click can move them", "FIG 3 · SLIDERS AND CLICKS", (
        component("wave-controls", "Parameters", "Drag a slider, or let the presenter click do it."),
        component("wave-plot", "Damped oscillation", "Teal: displacement. Dashed: the envelope. Horizontal axis: time, 0 to 2 s."),
        text("Click 1 moves **frequency**, click 2 presses a button, click 3 moves **damping**."),
    ), "figure", "Steps: move(waveFreq), choose(waveView), move(waveDamp). The left arrow restores the exact previous state.", steps=(
        step(move("waveFreq", 6, 1.4)),
        step(choose("waveView", "both")),
        step(move("waveDamp", 3, 1.4)),
    )),

    # 8. checkboxes and buttons, press / click steps, saveState / restoreState
    Slide("toggles", "Interaction", "Buttons and checkboxes are steps, and ← undoes them", "FIG 4 · CLICK, PRESS, UNDO", (
        component("scatter-controls", "Options", "A button that counts keeps its number in the plugin, so saveState records it."),
        component("scatter-plot", "Noisy points around a line", "Horizontal axis: x, 0 to 1. Vertical axis: y, 0 to 1."),
        text("Press → four times, then ← : each undo restores the checkboxes **and** the point count."),
    ), "figure", "click('#optFit') ticks a checkbox, press('addPts') clicks a button. Checkboxes are restored by the engine; the point count by saveState/restoreState.", steps=(
        step(click("#optFit")),
        step(press("addPts")),
        step(press("addPts")),
        step(click("#optGrid")),
    )),

    # 9. worker with status and isSettled
    Slide("worker", "Interaction", "A worker computes in the background and the export waits for it", "FIG 5 · LIVE CALCULATION", (
        component("walk-controls", "Random walks", "40,000 seeded walks per request, computed in a Web Worker."),
        component("walk-plot", "Where the walks end", "Bars: simulation. Teal: normal curve. Horizontal axis: end position, −150 to 150.", ),
        text("The slide's status line shows the request; **isSettled()** stays false until the result is drawn."),
    ), "figure", "A plugin that computes asynchronously must return false from isSettled as soon as an input event arrives.", steps=(
        step(move("walkLen", 1500, 1.6)),
        step(move("walkLen", 400, 1.2)),
    )),

    # 10. Three.js 3D with OrbitControls and slider steps
    Slide("knot", "Interaction", "Three.js gives a figure you can orbit, with sliders that reshape it", "FIG 6 · 3D WITH ORBITCONTROLS", (
        component("knot-controls", "Torus knot", "Drag the scene to orbit, wheel to zoom."),
        component("knot-scene", "A (2, q) torus knot", "Where WebGL is unavailable, a static picture takes its place."),
        text("The clicks change the **twist q**, the **tube radius** and the **surface style**."),
    ), "figure", "Steps: move(knotQ), move(knotTube), choose(knotStyle).", steps=(
        step(move("knotQ", 5, 1.2)),
        step(move("knotTube", 0.65, 1.2)),
        step(choose("knotStyle", "wire")),
    )),

    # 11. dial
    Slide("dial", "Interaction", "A dial can turn any slider, and a clicker steps the talk", "FIG 7 · DIAL AND CLICKER", (
        component("dial-controls", "Phase", "This slide declares dial=\"phase\"."),
        component("dial-plot", "A Lissajous curve", "A figure eight at 0°, a parabola at 45°. Axes: displacement, −1 to 1."),
        bullets("**F17** turns the dial forward, **F16** back.", "**PageDown** and **PageUp** step the talk, even while a slider has focus.", title="Keys"),
    ), "figure", "A dial turn is a manual change: it stops a running step animation, and PageUp restores the step snapshot.", steps=(
        step(move("phase", 45, 2.0)),
    ), dial="phase"),

    # 14. presenting keys, notes, check and pdf --vector
    Slide("delivery", "Delivery", "One source gives a talk, a check report and a PDF", "PRESENTING AND EXPORT", (
        table(("key", "action"), ("→ / Space / PageDown", "next step, then next slide"), ("← / Backspace / PageUp", "step back"),
              ("Home / End", "first or last slide"), ("F", "full screen"), ("F17 / F16", "turn the slide's dial"), title="Presenting keys"),
        table(("command", "result"), ("serve", "present with live reload"), ("check", "screenshots of every step; reports overflow and errors"),
              ("pdf", "one raster page per step"), ("pdf --vector", "selectable text, vector figures, links"), title="python3 -m pyslides <command> demo"),
        text("Presenter notes live in the slide's **notes** field. They are in the HTML and never on screen."),
    ), "columns", "These are the presenter notes of this slide. They are part of the page source and are not drawn."),

    # 15. summary
    Slide("summary", "Delivery", "Summary: write Python, present anywhere", "SUMMARY", (
        bullets("A deck is plain Python: slides, blocks and components.", "Math, figures, tables and layouts need no markup beyond a few characters.",
                "Sliders, workers and 3D are ordinary JavaScript behind click steps.",
                "The same source gives a browser talk, a **check** report and a PDF.", title="Take-home"),
        text("Start your own deck with **python3 -m pyslides new my-talk**."),
    ), "default", "Thank you. Everything in this deck is generated from deck.py and the files in assets/."),
)


COMPONENTS = {
    "hero": Component('<div id="heroScene" class="scene" data-component="heroScene" tabindex="-1">'
                      '<img class="scene-fallback" src="poster-hero.svg" alt="Static preview of the rotating point sphere"></div>',
                      frame="titlegraphic"),
    "markup-source": Component('<div class="code">Energy $E = mc^2$ is typeset inline.\n'
                               'Fractions and indices work: $\\frac{a}{b}$, $x_i^2$.\n'
                               'Use **bold** or **marked bold**{.hl} for emphasis.\n'
                               'Write \\$5 for a literal dollar sign.\n'
                               'Two classes: **both**{.hl .big}.</div>', frame="block"),
    "layout-gallery": Component('''<div class="gallery">
<figure><div class="thumb t-title"><i></i><i class="a"></i></div><figcaption>title</figcaption></figure>
<figure><div class="thumb"><i></i></div><figcaption>default</figcaption></figure>
<figure><div class="thumb t-columns"><i></i><i></i></div><figcaption>columns</figcaption></figure>
<figure><div class="thumb t-rows"><i></i><i></i></div><figcaption>rows</figcaption></figure>
<figure><div class="thumb t-figure"><i></i><i class="a"></i><i></i></div><figcaption>figure</figcaption></figure>
<figure><div class="thumb t-left"><i class="a"></i><i></i></div><figcaption>figure-left</figcaption></figure>
</div>'''),
    "step-css": Component('<div class="code">.layout-triptych {\n  grid-template-columns:\n    repeat(3, 1fr);\n}</div>', frame="block"),
    "step-register": Component('<div class="code">DECK = Deck(\n  slides=SLIDES,\n  layouts=("triptych",),\n  styles=("deck.css",),\n)</div>', frame="block"),
    "step-use": Component('<div class="code">Slide("triptych", ...,\n  blocks=(a, b, c),\n  layout="triptych")</div>', frame="block"),
    "sample-ko": Component('<p class="sample" lang="ko">슬라이드는 파이썬 파일 하나로 만들고, 브라우저에서 바로 발표한다.'
                           '<small>Slides are written as one Python file and presented straight from the browser.</small></p>', frame="block"),
    "sample-ja": Component('<p class="sample" lang="ja">スライドは Python のファイル一つで作り、そのままブラウザで発表できます。'
                           '<small>The same sentence in Japanese.</small></p>', frame="block"),
    "wave-controls": Component('''<div class="controls">
<label for="waveFreq">frequency (Hz)<output id="waveFreqOut">3</output></label><input id="waveFreq" type="range" min="1" max="8" step="0.5" value="3">
<label for="waveDamp">damping (1/s)<output id="waveDampOut">1.2</output></label><input id="waveDamp" type="range" min="0" max="4" step="0.1" value="1.2">
<div id="waveView" role="group" aria-label="view" class="seg"><button aria-pressed="true" data-v="curve">curve</button><button aria-pressed="false" data-v="both">curve + envelope</button></div>
</div>''', frame="block"),
    "wave-plot": Component('''<div class="chart-box"><div class="chart"><svg id="wavePlot" viewBox="0 0 640 360" role="img" aria-label="damped oscillation"></svg></div>
<div class="axis-row"><span>0</span><span>time (s)</span><span>2</span></div><p class="readouts" id="waveRead"></p></div>'''),
    "scatter-controls": Component('''<div class="controls">
<div class="checks"><label for="optGrid"><input id="optGrid" type="checkbox">Show grid</label>
<label for="optFit"><input id="optFit" type="checkbox">Show fitted line</label></div>
<div class="button-row"><button id="addPts" type="button">Add 20 points</button></div>
<p class="readouts">points drawn: <b id="ptCount">20</b></p>
</div>''', frame="block"),
    "scatter-plot": Component('''<div class="chart-box"><div class="chart"><svg id="scatterPlot" viewBox="0 0 640 360" role="img" aria-label="scatter plot"></svg></div>
<p class="readouts" id="scatterRead"></p></div>'''),
    "walk-controls": Component('''<div class="controls">
<label for="walkLen">steps per walk<output id="walkLenOut">100</output></label><input id="walkLen" type="range" min="25" max="1500" step="25" value="100">
</div>''', frame="block"),
    "walk-plot": Component('''<div class="chart-box"><div class="chart"><svg id="walkPlot" viewBox="0 0 640 360" role="img" aria-label="distribution of walk end points"></svg></div>
<div class="axis-row"><span>−150</span><span>end position</span><span>150</span></div><p class="readouts" id="walkRead"></p></div>''', status=True),
    "knot-controls": Component('''<div class="controls">
<label for="knotQ">twist q<output id="knotQOut">3</output></label><input id="knotQ" type="range" min="1" max="7" step="1" value="3">
<label for="knotTube">tube radius<output id="knotTubeOut">0.40</output></label><input id="knotTube" type="range" min="0.15" max="0.7" step="0.05" value="0.4">
<div id="knotStyle" role="group" aria-label="surface style" class="seg"><button aria-pressed="true" data-v="solid">solid</button><button aria-pressed="false" data-v="wire">wireframe</button></div>
</div>''', frame="block"),
    "knot-scene": Component('<div id="knotScene" class="scene" data-component="knotScene" tabindex="-1" role="group" aria-label="3D torus knot">'
                            '<img class="scene-fallback" src="poster-knot.svg" alt="Static preview of the torus knot"></div>'),
    "dial-controls": Component('''<div class="controls">
<label for="phase">phase<output id="phaseOut">0°</output></label><input id="phase" type="range" min="0" max="45" step="3" value="0">
</div>''', frame="block"),
    "dial-plot": Component('<div class="chart-box"><div class="chart"><svg id="dialPlot" viewBox="0 0 640 360" role="img" aria-label="Lissajous curve"></svg></div></div>'),
}

DECK = Deck(
    slides=SLIDES,
    title="PySlides demo",
    lang="en",
    # The six identity keys are always set here, so the demo looks the same whatever profile a machine has.
    theme={
        "author": "PySlides",
        "institute": ("Example Institute",),
        "short_institute": "Example Institute",
        "title_logos": ("logos/wordmark.svg",),
        "short_title": "PySlides demo",
        "date": "Feature tour",
    },
    components=COMPONENTS,
    scripts=("deck.js",),
    styles=("deck.css",),
    layouts=("triptych",),
)
