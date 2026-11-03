"""Slide model and HTML rendering. A deck is plain Python: Slide objects made of Blocks, plus the
interactive Components that deck registers and the presenter Steps that drive them."""
from __future__ import annotations

from dataclasses import dataclass, field
import json
import re
from html import escape
from typing import Iterable, Mapping

from .ui import ui_strings

# Inline markup in every text field: $...$ is KaTeX inline math, **...** is bold (optionally
# **...**{.name .other} for CSS classes defined in the deck stylesheet), \$ is a literal dollar.
_MATH = re.compile(r"(?<!\\)\$(.+?)(?<!\\)\$", re.S)
_CLASS = r"\.[A-Za-z_][\w-]*"
_BOLD = re.compile(rf"\*\*(.+?)\*\*(?:\{{({_CLASS}(?:[ \t]+{_CLASS})*)\}})?", re.S)


def _bold(match: re.Match) -> str:
    classes = match.group(2)
    attr = f' class="{" ".join(name[1:] for name in classes.split())}"' if classes else ""
    return f"<b{attr}>{match.group(1)}</b>"


def _markup(part: str) -> str:
    # Escaping first is safe: the class suffix uses only characters html.escape leaves alone.
    return _BOLD.sub(_bold, escape(part.replace("\\$", "$")))


def inline(value: str) -> str:
    """HTML for one text field: escaped, with inline math and bold."""
    out, pos = [], 0
    for match in _MATH.finditer(value):
        out.append(_markup(value[pos:match.start()]))
        out.append(f'<span class="tex-inline" data-tex-inline>{escape(match.group(1))}</span>')
        pos = match.end()
    out.append(_markup(value[pos:]))
    return "".join(out)


def plain(value: str) -> str:
    """The text of a field without markup, for attributes such as aria-label."""
    return _BOLD.sub(lambda m: m.group(1), _MATH.sub(r"\1", value)).replace("\\$", "$")


def unbalanced_math(value: str) -> bool:
    return len(re.findall(r"(?<!\\)\$", value)) % 2 == 1


@dataclass(frozen=True)
class Block:
    kind: str
    content: str = ""
    title: str = ""
    items: tuple[str, ...] = ()
    component: str = ""
    layout: str = ""
    caption: str = ""
    id: str = ""
    rows: tuple[tuple[str, ...], ...] = ()
    height: int = 0


@dataclass(frozen=True)
class Action:
    """One scripted control change. kind is "move" (animate a range input to value) or "press" (click target)."""
    kind: str
    target: str
    value: float | None = None
    seconds: float = 1.2


@dataclass(frozen=True)
class Slide:
    id: str
    section: str
    title: str
    eyebrow: str
    blocks: tuple[Block, ...]
    layout: str = "default"
    notes: str = ""
    # Each entry is one presenter click; its actions run together. Like Beamer overlays, a slide
    # first plays its steps and only then advances.
    steps: tuple[tuple[Action, ...], ...] = ()
    # Id of a range input or <video> on this slide that F17/F16 step forward/back (a pinch-and-turn dial, see AUTHORING.md).
    dial: str = ""


@dataclass(frozen=True)
class Component:
    """Markup for an interactive element that the deck's own JavaScript brings to life.

    frame: "figure" (captioned "Figure n:"), "table" ("Table:"), "block" (titled Beamer block)
    or "titlegraphic" (bare, for the title page). status adds the live-calculation status line.
    runtime_ids are ids that the deck's JavaScript creates later; press() may target them."""
    html: str = ""
    frame: str = "figure"
    status: bool = False
    runtime_ids: tuple[str, ...] = ()


@dataclass(frozen=True)
class Deck:
    slides: tuple[Slide, ...]
    title: str
    lang: str = "ko"
    theme: Mapping[str, object] = field(default_factory=dict)
    components: Mapping[str, Component] = field(default_factory=dict)
    # Files from the deck's assets/ folder. Each script is an ES module plugin (see AUTHORING.md).
    scripts: tuple[str, ...] = ()
    styles: tuple[str, ...] = ()
    # Extra layout names that a deck style defines as .layout-<name>.
    layouts: tuple[str, ...] = ()


def text(content: str, title: str = "") -> Block:
    return Block("text", content=content, title=title)


def bullets(*items: str, title: str = "") -> Block:
    return Block("bullets", title=title, items=items)


def equation(content: str, caption: str = "") -> Block:
    """LaTeX source, typeset in the browser by the vendored KaTeX."""
    return Block("equation", content=content, caption=caption)


def component(name: str, title: str, caption: str = "", figure: str = "") -> Block:
    return Block("component", title=title, caption=caption, component=name, id=figure)


def image(src: str, title: str, caption: str = "", height: int = 0) -> Block:
    """A captioned figure from the deck's assets/ folder (png, jpg, svg, webp). height caps it in px (default 560)."""
    return Block("image", content=src, title=title, caption=caption, height=height)


def table(header: Iterable[str], *rows: Iterable[str], title: str = "", caption: str = "") -> Block:
    """A booktabs-style table; give a title to caption it "Table:"."""
    return Block("table", items=tuple(header), rows=tuple(tuple(row) for row in rows), title=title, caption=caption)


def layers(*items: str) -> Block:
    return Block("layers", items=items)


def comparison(*items: str) -> Block:
    return Block("comparison", items=items)


def move(control: str, value: float, seconds: float = 1.2) -> Action:
    """Slide the range input with id `control` to `value`."""
    return Action("move", control, value, seconds)


def choose(group: str, value: str) -> Action:
    """Select the button with data-v=`value` in the segmented group with id `group`."""
    return Action("press", f'#{group} button[data-v="{value}"]')


def press(button_id: str) -> Action:
    """Click the button with id `button_id`."""
    return Action("press", f"#{button_id}")


def click(selector: str) -> Action:
    """Click the first element on the slide that matches a CSS selector."""
    return Action("press", selector)


def step(*actions: Action) -> tuple[Action, ...]:
    return actions


def figure_label(slide: Slide | None, frame: str) -> str:
    kind = "Table" if frame == "table" else "Figure"
    match = re.match(r"FIG (\d+)", slide.eyebrow) if slide and kind == "Figure" else None
    return f"{kind} {match.group(1)}:" if match else f"{kind}:"


def figure_caption(slide: Slide | None, frame: str, title: str, caption: str) -> str:
    detail = f" {inline(caption)}" if caption else ""
    return f'<p class="caption figure-caption"><span class="caption-label">{figure_label(slide, frame)}</span> {inline(title)}.{detail}</p>'


GRAPHIC_KINDS = {"component", "image"}
IMAGE_TYPES = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".avif"}


class Renderer:
    def __init__(self, components: Mapping[str, Component], meta: Mapping[str, object], lang: str = "ko"):
        self.components = components
        self.meta = meta
        self.ui = ui_strings(lang)

    def component(self, block: Block, slide: Slide | None = None) -> str:
        name = escape(block.component)
        spec = self.components.get(block.component, Component())
        identifier = f' id="{escape(block.id)}"' if block.id else ""
        body = spec.html or f'<div data-component="{name}"{identifier}></div>'
        label = escape(plain(block.title))
        if spec.frame == "titlegraphic":
            return f'<section class="module module--titlegraphic" data-module="{name}" aria-label="{label}">{body}</section>'
        if spec.frame == "block":
            hint = f'<p class="caption">{inline(block.caption)}</p>' if block.caption else ""
            return f'<section class="module beamer-block" data-module="{name}" aria-label="{label}"><header class="module-head block-title"><h3>{inline(block.title)}</h3></header><div class="block-body">{body}{hint}</div></section>'
        return f'<section class="module module--figure" data-module="{name}" aria-label="{label}">{body}{figure_caption(slide, spec.frame, block.title, block.caption)}</section>'

    def block(self, block: Block, slide: Slide | None = None) -> str:
        if block.kind in {"text", "bullets"}:
            inner = f"<p>{inline(block.content)}</p>" if block.kind == "text" else "<ul>" + "".join(f"<li>{inline(item)}</li>" for item in block.items) + "</ul>"
            if block.title:
                return f'<div class="text-block beamer-block"><h3 class="block-title">{inline(block.title)}</h3><div class="block-body">{inner}</div></div>'
            return f'<div class="text-block">{inner}</div>'
        if block.kind == "equation":
            cap = f'<p class="caption">{inline(block.caption)}</p>' if block.caption else ""
            # LaTeX source; the browser typesets it with the vendored KaTeX and keeps the source if that fails.
            return f'<figure class="equation"><div class="tex" data-tex>{escape(block.content)}</div>{cap}</figure>'
        if block.kind == "component":
            return self.component(block, slide)
        if block.kind == "image":
            size = f' style="max-height:{int(block.height)}px"' if block.height else ""
            img = f'<img src="/{escape(block.content)}" alt="{escape(plain(block.title))}"{size}>'
            if slide and slide.layout == "title":
                return f'<section class="module module--titlegraphic module--image">{img}</section>'
            return f'<section class="module module--figure module--image">{img}{figure_caption(slide, "figure", block.title, block.caption)}</section>'
        if block.kind == "table":
            head = "".join(f"<th>{inline(cell)}</th>" for cell in block.items)
            body = "".join("<tr>" + "".join(f"<td>{inline(cell)}</td>" for cell in row) + "</tr>" for row in block.rows)
            caption = figure_caption(slide, "table", block.title, block.caption) if block.title else ""
            return f'<section class="module module--figure module--table"><div class="table-scroll"><table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table></div>{caption}</section>'
        if block.kind == "layers":
            return '<ol class="layer-grid">' + "".join(f"<li><p>{inline(item)}</p></li>" for item in block.items) + "</ol>"
        if block.kind == "comparison":
            return '<div class="text-block comparison-grid"><ul>' + "".join(f"<li>{inline(item)}</li>" for item in block.items) + "</ul></div>"
        raise ValueError(f"Unknown block kind: {block.kind}")

    def title_blocks(self, slide: Slide) -> str:
        """Title page: up to two text blocks (rows 3 and 4 on the left) and one title graphic (right column)."""
        out, n = [], 0
        for block in slide.blocks:
            html = self.block(block, slide)
            if block.kind not in GRAPHIC_KINDS:
                n += 1
                html = html.replace('class="text-block', f'class="text-block title-text-{n}', 1)
            out.append(html)
        return "".join(out)

    def slide(self, slide: Slide, index: int, total: int) -> str:
        meta = self.meta
        classes = "slide is-active" if index == 0 else "slide"
        components = ",".join(block.component for block in slide.blocks if block.component)
        author, short_title, date, short_institute = (escape(str(meta[key]).strip()) for key in ("author", "short_title", "date", "short_institute"))
        institute = "<br>".join(escape(line) for line in meta["institute"] if str(line).strip())
        live = any(self.components.get(block.component, Component()).status for block in slide.blocks)
        status = '<p class="calc-status slide-calc-status" role="status" aria-live="polite"></p>' if live else ""
        steps = escape(json.dumps([[{"kind": x.kind, "target": x.target, "value": x.value, "seconds": x.seconds} for x in actions] for actions in slide.steps]))
        dial = f' data-dial="{escape(slide.dial)}"' if slide.dial else ""
        attrs = f'data-steps="{steps}"{dial} id="{escape(slide.id)}" data-slide-id="{escape(slide.id)}" data-title="{escape(plain(slide.title))}" data-section="{escape(slide.section)}" data-components="{escape(components)}" aria-labelledby="title-{escape(slide.id)}"{" inert hidden" if index else ""}'
        notes_label = escape(self.ui["notes"])
        notes = f'<aside class="notes" aria-label="{notes_label}">{escape(slide.notes)}</aside>'
        if slide.layout == "title":
            # Beamer \begin{frame}[plain]\titlepage: no headline or footline; a component or image is the title graphic.
            logos = "".join(f'<img src="/{escape(str(path))}" alt="">' for path in meta.get("title_logos", ()))
            logos = f'<div class="titlegraphic">{logos}</div>' if logos else ""
            lines = [(name, value) for name, value in (("author", author), ("institute", institute), ("date", date)) if value]
            meta_lines = "".join(f'<p class="{name}">{value}</p>' for name, value in lines)
            return f'''<article class="{classes} slide--title" data-plain="true" {attrs}>
<div class="slide-body layout-title">{logos}
<header class="title-block"><h1 id="title-{escape(slide.id)}">{inline(slide.title)}</h1><p class="subtitle">{inline(slide.eyebrow)}</p></header>
{self.title_blocks(slide)}
<div class="title-meta">{meta_lines}{status}</div></div>
{notes}
</article>'''
        blocks = "".join(self.block(block, slide) for block in slide.blocks)
        byline = f"{author}&emsp;({short_institute})" if author and short_institute else author or short_institute
        return f'''<article class="{classes}" {attrs}>
<header class="slide-heading frametitle"><h1 id="title-{escape(slide.id)}">{inline(slide.title)}</h1><p class="framesubtitle">{inline(slide.eyebrow)}</p>{status}</header>
<div class="slide-body layout-{escape(slide.layout)}">{blocks}</div>
<footer class="footline"><span>{byline}</span><span>{short_title}</span><span>{date}<span class="frameno">{index+1} / {total}</span><span class="stepdots" aria-hidden="true">{"<i></i>" * len(slide.steps)}</span></span></footer>
{notes}
</article>'''


LAYOUTS = {"title", "default", "columns", "rows", "figure", "figure-left"}
SAFE_ID = re.compile(r"[A-Za-z][\w-]*")


def text_fields(slide: Slide) -> Iterable[str]:
    yield from (slide.title, slide.eyebrow)
    for block in slide.blocks:
        if block.kind != "equation":
            yield block.content
        yield from (block.title, block.caption, *block.items, *(cell for row in block.rows for cell in row))


def validate_slides(slides: Iterable[Slide], components: Mapping[str, Component] | None = None,
                    layouts: Iterable[str] = ()) -> None:
    """Fail the build on mistakes that would otherwise only show up during the talk."""
    components = components or {}
    layouts = LAYOUTS | set(layouts)
    renderer = Renderer(components, {})
    seen: set[str] = set()
    element_ids: dict[str, str] = {}
    for slide in slides:
        if not slide.id.isascii() or not slide.id.replace("-", "").isalnum():
            raise ValueError(f"Slide id must be stable ASCII letters/numbers/hyphens: {slide.id}")
        if slide.id in seen:
            raise ValueError(f"Duplicate slide id: {slide.id}")
        seen.add(slide.id)
        if not slide.title.strip():
            raise ValueError(f"Slide title is empty: {slide.id}")
        if slide.layout not in layouts:
            raise ValueError(f"Unknown layout on {slide.id}: {slide.layout} (one of {', '.join(sorted(LAYOUTS))}; "
                             "a deck style can add more through Deck.layouts)")
        for field in text_fields(slide):
            if unbalanced_math(field):
                raise ValueError(f"Unbalanced $ on {slide.id} (write \\$ for a literal dollar): {field}")
        for block in slide.blocks:
            if block.kind in {"text", "equation", "image"} and not block.content.strip():
                raise ValueError(f"Empty {block.kind} in {slide.id}")
            if block.kind in {"bullets", "layers", "comparison", "table"} and not block.items:
                raise ValueError(f"Empty {block.kind} in {slide.id}")
            if block.kind == "component" and block.component not in components:
                raise ValueError(f"Unknown component on {slide.id}: {block.component} (register it in Deck.components)")
            if block.kind == "image" and "." + block.content.rsplit(".", 1)[-1].lower() not in IMAGE_TYPES:
                raise ValueError(f"image() on {slide.id} needs a browser image ({', '.join(sorted(IMAGE_TYPES))}): {block.content}. "
                                 "Convert PDF/EPS first, e.g. pdftoppm -png -r 200 -singlefile fig.pdf fig")
        if slide.layout == "title":
            graphics = [b for b in slide.blocks if b.kind in GRAPHIC_KINDS]
            texts = [b for b in slide.blocks if b.kind in {"text", "bullets"}]
            if len(graphics) > 1 or len(texts) > 2 or len(graphics) + len(texts) != len(slide.blocks):
                raise ValueError(f"Title slide {slide.id} takes up to two text/bullets blocks and one component or image")
        markup = "".join(renderer.block(block, slide) for block in slide.blocks)
        # Every id lives in one document: slide ids, their title ids and component element ids must not clash.
        for ident in (slide.id, f"title-{slide.id}", *re.findall(r'\sid="([^"]+)"', markup)):
            if ident in element_ids:
                raise ValueError(f"Duplicate element id {ident!r} on {slide.id} and {element_ids[ident]}: "
                                 "a slide id equals an element id, or one component is used on two slides")
            element_ids[ident] = slide.id
        runtime = {ident for block in slide.blocks if block.component for ident in components[block.component].runtime_ids}
        dial_id = re.escape(slide.dial)
        if slide.dial and not (re.search(rf'<video\b[^>]*\sid="{dial_id}"|id="{dial_id}"[^>]*type="range"|type="range"[^>]*id="{dial_id}"', markup) or slide.dial in runtime):
            raise ValueError(f"dial needs the id of a range input or video on {slide.id}: {slide.dial}")
        for actions in slide.steps:
            if not actions:
                raise ValueError(f"Empty step in {slide.id}")
            for action in actions:
                if action.kind == "move":
                    found = re.search(rf'id="{re.escape(action.target)}"[^>]*type="range"|type="range"[^>]*id="{re.escape(action.target)}"', markup)
                    if action.value is None or not (found or action.target in runtime):
                        raise ValueError(f"move() needs a range input id on {slide.id}: {action.target}")
                elif action.kind == "press":
                    hooks = re.findall(r'#([^\s.#\[\]:>+~,()"]+)|data-([\w-]+)="([^"]*)"', action.target)
                    for ident, attr, value in hooks:
                        if ident and not SAFE_ID.fullmatch(ident):
                            raise ValueError(f"Step target id must start with a letter and use letters, digits, - or _ on {slide.id}: {ident}")
                        needle = f'id="{ident}"' if ident else f'data-{attr}="{value}"'
                        if needle not in markup and ident not in runtime:
                            raise ValueError(f"press() target not found on {slide.id}: {action.target}")
                else:
                    raise ValueError(f"Unknown step action on {slide.id}: {action.kind}")
