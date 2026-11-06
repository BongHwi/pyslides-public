from __future__ import annotations

import importlib.util
import json
import os
import re
import shutil
import sys
from html import escape
from pathlib import Path

from .core import Deck, Renderer, validate_slides
from .theme import THEME, css_variables
from .ui import ui_strings

REPO = Path(__file__).resolve().parent.parent
STATIC = REPO / "static"
DECKS = REPO / "decks"
ENGINE_FILES = ("theme.css", "slides.js", "steps.js", "controls.js", "laser.js")
ENGINE_DIRS = ("vendor", "fonts")
PROFILE_ENV = "PYSLIDES_PROFILE"
PROFILE_CSS = "profile.css"


def deck_dir(name: str | Path) -> Path:
    """A bare name means decks/<name>; anything with a path separator (or ~, .) is a folder anywhere."""
    text = str(name)
    if "/" in text or text.startswith((".", "~")):
        return Path(text).expanduser().resolve()
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", text):
        raise SystemExit(f"Deck name must use letters, digits, '.', '_' or '-' (or give a path): {text!r}")
    return (DECKS / text).resolve()


def load_deck(folder: Path) -> Deck:
    source = folder / "deck.py"
    if not source.is_file():
        raise SystemExit(f"No deck.py in {folder}")
    spec = importlib.util.spec_from_file_location("pyslides_deck_" + re.sub(r"\W", "_", folder.name), source)
    module = importlib.util.module_from_spec(spec)
    # deck.py may import helper modules from its own folder; forget them afterwards so another deck
    # with a helper of the same name gets its own.
    before = set(sys.modules)
    sys.path.insert(0, str(folder))
    try:
        sys.modules[spec.name] = module
        spec.loader.exec_module(module)
    finally:
        sys.path.remove(str(folder))
        for name in set(sys.modules) - before:
            if name != spec.name:
                del sys.modules[name]
    deck = getattr(module, "DECK", None)
    if not isinstance(deck, Deck):
        raise SystemExit(f"{source} must define DECK = Deck(...)")
    validate_slides(deck.slides, deck.components, deck.layouts)
    for slide in deck.slides:
        for block in slide.blocks:
            if block.kind == "image" and not (folder / "assets" / block.content).is_file():
                raise SystemExit(f"image() on {slide.id}: assets/{block.content} does not exist")
    return deck


def resolve_profile(flag: str | Path | None = None) -> Path | None:
    """The profile folder: --profile wins over $PYSLIDES_PROFILE; an empty value counts as unset.
    A relative path is relative to the current working directory."""
    for value in (flag, os.environ.get(PROFILE_ENV)):
        if value is not None and str(value).strip():
            return Path(str(value).strip()).expanduser().resolve()
    return None


def load_profile(folder: Path) -> dict:
    """Read <folder>/profile.json: an object whose keys are keys of THEME, with the types THEME uses."""
    if not folder.is_dir():
        raise SystemExit(f"Profile folder does not exist: {folder}")
    source = folder / "profile.json"
    if not source.is_file():
        raise SystemExit(f"No profile.json in the profile folder {folder}")
    try:
        data = json.loads(source.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise SystemExit(f"{source} is not valid JSON: {error}")
    if not isinstance(data, dict):
        raise SystemExit(f"{source} must hold a JSON object of theme keys, not {type(data).__name__}")
    unknown = sorted(set(data) - set(THEME))
    if unknown:
        raise SystemExit(f"{source}: unknown key(s) {', '.join(map(repr, unknown))}; valid keys: {', '.join(THEME)}")
    for key, value in data.items():
        default = THEME[key]
        if key in ("institute", "title_logos"):
            ok = isinstance(value, str) or (isinstance(value, list) and all(isinstance(item, str) for item in value))
            want = "a string or a list of strings"
        elif isinstance(default, int):
            ok, want = isinstance(value, int) and not isinstance(value, bool), "an integer"
        else:
            ok, want = isinstance(value, str), "a string"
        if not ok:
            raise SystemExit(f"{source}: {key!r} must be {want}, not {json.dumps(value, ensure_ascii=False)[:60]}")
    return data


def build_site(folder: Path, deck: Deck | None = None, profile: str | Path | None = None) -> Path:
    """Build <folder>/build. `profile` is the --profile value; without it $PYSLIDES_PROFILE is used."""
    profile_dir = resolve_profile(profile)
    profile_theme = load_profile(profile_dir) if profile_dir else {}
    deck = deck or load_deck(folder)
    output = folder / "build"
    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True)
    for name in ENGINE_FILES:
        shutil.copy2(STATIC / name, output / name)
    for directory in ENGINE_DIRS:
        shutil.copytree(STATIC / directory, output / directory)
    provided: set[str] = set()
    if profile_dir:
        copy_assets(profile_dir / "assets", output, "profile ", provided)
    copy_assets(folder / "assets", output, "", provided, owner="profile" if profile_dir else "")
    has_profile_css = bool(profile_dir) and (profile_dir / "assets" / PROFILE_CSS).is_file()
    for name in (*deck.scripts, *deck.styles):
        if not (output / name).is_file():
            raise SystemExit(f"Deck lists {name} but assets/{name} does not exist")
    theme = {**THEME, **profile_theme, **deck.theme}
    for key in ("institute", "title_logos"):
        if isinstance(theme[key], str):
            theme[key] = (theme[key],)
    renderer = Renderer(deck.components, theme, deck.lang)
    ui = {key: escape(value) for key, value in ui_strings(deck.lang).items()}
    slides = deck.slides
    frames = "\n".join(renderer.slide(slide, i, len(slides)) for i, slide in enumerate(slides))
    styles = "".join(f'<link rel="stylesheet" href="/{escape(name)}">' for name in ((PROFILE_CSS,) if has_profile_css else ()) + tuple(deck.styles))
    plugins = escape(json.dumps(["/" + name for name in deck.scripts]))
    index = f'''<!doctype html>
<html lang="{escape(deck.lang)}" style="{escape(css_variables(theme))}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light"><meta name="theme-color" content="#ffffff"><link rel="icon" href="data:,">
<title>{escape(deck.title)}</title><link rel="stylesheet" href="/fonts/pretendard/pretendard.css"><link rel="stylesheet" href="/fonts/line-seed-jp/line-seed-jp.css"><link rel="stylesheet" href="/fonts/dejavu/dejavu.css"><link rel="stylesheet" href="/vendor/katex/katex.min.css"><link rel="stylesheet" href="/theme.css">{styles}</head>
<body data-plugins="{plugins}" data-laser-label="{ui['laser']}" data-related-label="{ui['related']}" data-return-label="{ui['return']}"><main class="viewport" id="presentation" tabindex="0" aria-label="{ui['presentation']}">
<div class="stage-shell"><div class="stage" id="stage"><nav class="sections miniframes" aria-label="{ui['sections']}">{miniframes(slides)}</nav>
<div id="slides" aria-live="off">{frames}</div><aside class="chooser" id="chooser" hidden aria-label="{ui['chooser']}"><button class="overlay-close" aria-label="{ui['close_label']}">{ui['close']}</button><ol></ol></aside>
<div class="stage-controls"><button id="previous" aria-label="{ui['previous_label']}">{ui['previous']}</button><button id="openChooser" aria-label="{ui['contents_label']}">{ui['contents']}</button><button id="fullscreen" aria-label="{ui['fullscreen_label']}">{ui['fullscreen']}</button><button id="next" aria-label="{ui['next_label']}">{ui['next']}</button></div>
</div></div></main><script src="/vendor/katex/katex.min.js"></script><script type="module" src="/slides.js"></script></body></html>'''
    (output / "index.html").write_text(index, encoding="utf-8")
    manifest = [{"id": s.id, "title": s.title, "section": s.section, "steps": len(s.steps),
                 "components": [b.component for b in s.blocks if b.component]} for s in slides]
    (output / "presentation.json").write_text(json.dumps({"title": deck.title, "slides": manifest}, ensure_ascii=False, indent=1), encoding="utf-8")
    return output


RESERVED = {"index.html", "presentation.json"}


def copy_assets(assets: Path, output: Path, label: str = "", provided: set[str] | None = None, owner: str = "") -> None:
    """Copy an assets/ folder (the deck's, or the profile's with label "profile ") into the build.
    Nothing the engine provides may be replaced, and a deck asset may not replace a profile asset."""
    provided = provided if provided is not None else set()
    if assets.is_symlink():
        raise SystemExit(f"{label}assets is a symlink; copy the folder instead")
    if not assets.is_dir():
        return
    for root, dirs, files in os.walk(assets):
        for name in dirs + files:
            if (Path(root) / name).is_symlink():
                raise SystemExit(f"{label}assets/{(Path(root) / name).relative_to(assets)} is a symlink; copy the file instead")
        for name in files:
            source = Path(root) / name
            relative = source.relative_to(assets)
            target = output / relative
            key = relative.as_posix()
            if key in provided:
                raise SystemExit(f"assets/{key} would replace a file the {owner} provides")
            if key in RESERVED or target.exists():
                raise SystemExit(f"{label}assets/{key} would replace a file the engine provides")
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
            if label:
                provided.add(key)


def miniframes(slides) -> str:
    """Segmented section progress: one track per section, width proportional to its frame count,
    one invisible slice per frame so a click on the track jumps to that frame."""
    groups: dict[str, list[tuple[int, object]]] = {}
    for i, slide in enumerate(slides):
        if slide.layout != "title":
            groups.setdefault(slide.section, []).append((i, slide))
    out = []
    for section, frames in groups.items():
        dots = "".join(f'<button class="mf-dot" data-goto="{escape(slide.id)}" data-index="{i}" tabindex="-1" aria-label="{i+1}. {escape(slide.title)}"></button>' for i, slide in frames)
        out.append(f'<div class="mf-section" data-state="todo" style="flex-grow:{len(frames)}"><span class="mf-track"><i class="mf-fill"></i><span class="mf-dots">{dots}</span></span><span class="section-name">{escape(section)}</span></div>')
    return "".join(out)
