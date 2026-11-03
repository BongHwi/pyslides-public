"""Text the engine itself puts on screen (buttons, aria-labels), one table per Deck.lang."""
from __future__ import annotations

# Keys: previous/contents/fullscreen/next are the stage buttons, *_label their aria-labels,
# close/close_label the chooser's button, sections/chooser the landmark labels, notes the presenter notes,
# presentation the label of the whole viewport.
UI: dict[str, dict[str, str]] = {
    "ko": {
        "previous": "← 이전", "contents": "목차", "fullscreen": "전체 화면", "next": "다음 →",
        "previous_label": "이전 슬라이드", "contents_label": "슬라이드 목차 열기",
        "fullscreen_label": "전체 화면 전환", "next_label": "다음 슬라이드",
        "close": "닫기", "close_label": "선택 창 닫기",
        "sections": "발표 섹션", "chooser": "슬라이드 선택", "notes": "발표자 노트",
        "presentation": "Interactive slide presentation",
    },
    "en": {
        "previous": "← Previous", "contents": "Contents", "fullscreen": "Full screen", "next": "Next →",
        "previous_label": "Previous slide", "contents_label": "Open slide list",
        "fullscreen_label": "Toggle full screen", "next_label": "Next slide",
        "close": "Close", "close_label": "Close chooser",
        "sections": "Presentation sections", "chooser": "Slide list", "notes": "Presenter notes",
        "presentation": "Interactive slide presentation",
    },
    "ja": {
        "previous": "← 前へ", "contents": "目次", "fullscreen": "全画面", "next": "次へ →",
        "previous_label": "前のスライド", "contents_label": "スライド一覧を開く",
        "fullscreen_label": "全画面表示の切り替え", "next_label": "次のスライド",
        "close": "閉じる", "close_label": "スライド選択を閉じる",
        "sections": "発表セクション", "chooser": "スライド一覧", "notes": "発表者ノート",
        "presentation": "インタラクティブなスライド発表",
    },
}


def ui_strings(lang: str) -> dict[str, str]:
    """The table for a Deck.lang such as "ko", "en-US" or "ja_JP"; any other language gets English."""
    code = lang.lower().replace("_", "-").split("-")[0]
    return UI.get(code, UI["en"])
