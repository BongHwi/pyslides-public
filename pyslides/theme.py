"""Default theme: a Beamer-style light theme (Singapore layout, seagull colours).

Precedence, lowest first: THEME, the profile (profile.json, see build.py), Deck.theme."""

THEME = {
    "paper": "#ffffff",
    "ink": "#111111",
    "structure": "#46413c",
    "secondary": "#aaa5a0",
    "alert": "#e10019",
    "teal": "#009682",
    "proton": "#2a78d6",
    "neutron": "#eb6834",
    "mix": "#1baf7a",
    "ink_soft": "#5d5955",
    "rule": "#d9d7d5",
    "surface": "#f7f6f5",
    "surface_2": "#f7f6f5",
    "s4": "#878078",
    "s5": "#b4aea7",
    "s6": "#68635e",
    "muted": "#5d5955",
    "ink_2": "#46413c",
    "line": "#d9d7d5",
    "line_2": "#bdb9b5",
    "accent": "#009682",
    "shadow": "0 2px 10px #00000018",
    "f_body": 'Pretendard, "LINE Seed JP", sans-serif',
    "f_mono": "ui-monospace, SFMono-Regular, Consolas, monospace",
    "font_body": 'Pretendard, "LINE Seed JP", sans-serif',
    "font_mono": "ui-monospace, SFMono-Regular, Consolas, monospace",
    "ink_muted": "#5d5955",
    "canvas_width": 1600,
    "canvas_height": 900,
    "author": "",
    "institute": (),
    "short_institute": "",
    "title_logos": (),
    "short_title": "",
    "date": "",
}


def css_variables(THEME: dict = THEME) -> str:
    return f'''--paper:{THEME["paper"]};--ink:{THEME["ink"]};--structure:{THEME["structure"]};
--secondary:{THEME["secondary"]};--alert:{THEME["alert"]};--teal:{THEME["teal"]};
--proton:{THEME["proton"]};--neutron:{THEME["neutron"]};--mix:{THEME["mix"]};
--ink-soft:{THEME["ink_soft"]};--rule:{THEME["rule"]};--surface:{THEME["surface"]};
--surface-2:{THEME["surface_2"]};--s4:{THEME["s4"]};--s5:{THEME["s5"]};--s6:{THEME["s6"]};
--muted:{THEME["muted"]};--ink-2:{THEME["ink_2"]};--line:{THEME["line"]};--line-2:{THEME["line_2"]};
--accent:{THEME["accent"]};--shadow:{THEME["shadow"]};--f-body:{THEME["f_body"]};--f-mono:{THEME["f_mono"]};
--font-body:{THEME["font_body"]};--font-mono:{THEME["font_mono"]};--ink-muted:{THEME["ink_muted"]};
--deck-w:{THEME["canvas_width"]};--deck-h:{THEME["canvas_height"]};'''
