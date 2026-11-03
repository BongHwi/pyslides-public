"""PySlides: interactive Beamer-style decks written in Python. See AUTHORING.md."""
from .core import (Action, Block, Component, Deck, Slide, bullets, choose, click, comparison, component,
                   equation, image, layers, move, press, step, table, text, validate_slides)

__all__ = ["Action", "Block", "Component", "Deck", "Slide", "bullets", "choose", "click", "comparison", "component",
           "equation", "image", "layers", "move", "press", "step", "table", "text", "validate_slides"]
