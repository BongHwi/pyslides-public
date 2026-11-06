"""A small example of laser cues and links to related backup slides."""
from __future__ import annotations

from pyslides import Component, Deck, LaserCue, Slide, click, component, step, text

SLIDES = (
    Slide(
        "result", "Talk", "Reveal points, then a reference line", "LASER CUE",
        (component("result-figure", "Illustrative marks", "Reveal the points, then the line."),),
        "default",
        "The laser is on an existing Build. Hover over the lower-right controls to toggle it.",
        steps=(step(click("#result-points")), step(click("#result-fit"))),
        laser=(LaserCue(step=1, selector="#demo-points", x=0.68, y=0.48, rx=0.17, ry=0.16),),
        related=(("method", "Analysis method"),),
    ),
    Slide(
        "summary", "Talk", "An example of presenter controls", "SUMMARY",
        (text("These marks are illustrative; the demo is about presentation controls."),),
        "default",
        "A laser cue is optional. The toolbar checkbox applies to the whole deck.",
    ),
    Slide(
        "method", "Backup", "Backup: an example of related detail", "RELATED DETAIL",
        (component("method-figure", "Analysis steps", "The backup is a regular slide in the deck."),),
        "default",
        "Return resumes the main slide at the Build that opened this backup.",
        related=(("summary", "Talk summary"),),
    ),
    Slide(
        "method-extra", "Backup", "Another backup slide", "RELATED DETAIL",
        (text("A presenter can move through backups and still return to the original Build."),),
        "default",
    ),
)

COMPONENTS = {
    "result-figure": Component(
        '<div class="demo-figure" role="img" aria-label="Illustration of measured points and a fit">'
        '<span class="axis"></span><i id="demo-points" class="points" data-r="1">●　●　●　●</i>'
        '<span id="demo-fit" class="fit" data-r="2"></span>'
        '<input id="result-points" class="demo-step" type="checkbox" aria-label="Reveal measured points" tabindex="-1">'
        '<input id="result-fit" class="demo-step" type="checkbox" aria-label="Reveal fitted trend" tabindex="-1">'
        '</div>', frame="block",
    ),
    "method-figure": Component(
        '<ol class="method-list"><li>Show the points</li><li>Show a reference line</li><li>Return to the calling Build</li></ol>',
        frame="block",
    ),
}

DECK = Deck(
    slides=SLIDES,
    title="PySlides presenter controls demo",
    lang="en",
    theme={"author": "PySlides demo", "short_title": "Presenter controls", "date": "Demo"},
    components=COMPONENTS,
    styles=("demo.css",),
)
