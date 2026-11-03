"""PySlides command line: python3 -m pyslides <command> <deck>.

A deck is decks/<name>/ in this repository, or any folder path that holds a deck.py."""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from .build import DECKS, REPO, build_site, deck_dir, load_deck

TEMPLATE = REPO / "templates" / "new-deck"


def handler_for(root: Path, quiet: bool = False):
    root = root.resolve()

    class DeckHandler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(root), **kwargs)

        def translate_path(self, path):
            # Serve only real files inside the build; symlinks that leave it resolve to a 404.
            candidate = Path(super().translate_path(path)).resolve()
            if candidate == root or root in candidate.parents:
                return str(candidate)
            return str(root / "__pyslides_forbidden_request__")

        def send_head(self):
            # Browsers seek a <video> only when the server answers byte ranges, which http.server does not.
            self.range_left = None
            match = re.fullmatch(r"bytes=(\d*)-(\d*)", self.headers.get("Range", "").strip())
            path = Path(self.translate_path(self.path))
            if not match or not any(match.groups()) or not path.is_file():
                return super().send_head()
            size = path.stat().st_size
            first, last = match.groups()
            start, end = (int(first), min(int(last) if last else size - 1, size - 1)) if first else (max(0, size - int(last)), size - 1)
            if start >= size or start > end:
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{size}")
                self.end_headers()
                return None
            source = path.open("rb")
            source.seek(start)
            self.send_response(206)
            self.send_header("Content-Type", self.guess_type(str(path)))
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            self.send_header("Content-Length", str(end - start + 1))
            self.send_header("Accept-Ranges", "bytes")
            self.end_headers()
            self.range_left = end - start + 1
            return source

        def copyfile(self, source, outputfile):
            left, self.range_left = getattr(self, "range_left", None), None
            if left is None:
                return super().copyfile(source, outputfile)
            try:
                while left > 0 and (chunk := source.read(min(left, 1 << 16))):
                    outputfile.write(chunk)
                    left -= len(chunk)
            except (BrokenPipeError, ConnectionResetError):
                pass  # the browser dropped a range it no longer needs, which it does while seeking

        def log_message(self, fmt, *args):
            if not quiet:
                print("http:", fmt % args)

    return DeckHandler


def cmd_new(a) -> int:
    folder = deck_dir(a.deck)
    if folder.exists() and any(folder.iterdir()):
        print(f"{folder} already exists and is not empty", file=sys.stderr)
        return 1
    shutil.copytree(TEMPLATE, folder, dirs_exist_ok=True)
    source = folder / "deck.py"
    source.write_text(source.read_text(encoding="utf-8").replace("__TITLE__", json.dumps(a.title or folder.name, ensure_ascii=False)[1:-1]), encoding="utf-8")
    print(f"New deck: {folder}\nEdit {source}, then: python3 -m pyslides serve {a.deck}")
    return 0


def cmd_list(a) -> int:
    failed = 0
    for folder in sorted(p for p in DECKS.iterdir() if (p / "deck.py").is_file()):
        try:
            deck = load_deck(folder)
        except (Exception, SystemExit) as error:
            failed += 1
            print(f"{folder.name:24} ERROR {error}")
            continue
        steps = sum(len(s.steps) for s in deck.slides)
        print(f"{folder.name:24} {len(deck.slides):3} slides {steps:3} steps  {deck.title}")
    return 1 if failed else 0


def cmd_build(a) -> int:
    print(f"Built {build_site(deck_dir(a.deck), profile=a.profile)}")
    return 0


def cmd_serve(a) -> int:
    output = build_site(deck_dir(a.deck), profile=a.profile)
    try:
        server = ThreadingHTTPServer(("127.0.0.1", a.port), handler_for(output))
    except OSError as error:
        print(f"Cannot listen on 127.0.0.1:{a.port} ({error.strerror}). If the deck is already served there, "
              f"run `build` and reload the browser; otherwise use --port N, or --port 0 for any free port.", file=sys.stderr)
        return 1
    url = f"http://127.0.0.1:{server.server_address[1]}/"
    print(f"PySlides ready: {url}", flush=True)
    if not a.no_browser:
        threading.Timer(.6, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


def capture(a, *extra: str) -> int:
    """Serve the build on a free loopback port and let tools/capture.mjs walk every slide and step."""
    node = shutil.which("node")
    if not node:
        print("This command needs Node.js and the repository's Playwright (npm ci).", file=sys.stderr)
        return 2
    folder = deck_dir(a.deck)
    output = build_site(folder, profile=a.profile)
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler_for(output, quiet=True))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        url = f"http://127.0.0.1:{server.server_address[1]}/"
        return subprocess.call([node, str(REPO / "tools" / "capture.mjs"), url, *extra], cwd=REPO)
    finally:
        server.shutdown()
        server.server_close()


def cmd_pdf(a) -> int:
    folder = deck_dir(a.deck)
    out = Path(a.output).resolve() if a.output else folder / "export" / f"{folder.name}.pdf"
    return capture(a, "--pdf", str(out), "--scale", str(a.scale), *(["--vector"] if a.vector else []))


def cmd_check(a) -> int:
    folder = deck_dir(a.deck)
    return capture(a, "--shots", str(a.output and Path(a.output).resolve() or folder / "export" / "check"), "--scale", "1")


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="python3 -m pyslides", description="Build, present and export Python-authored interactive decks.")
    sub = p.add_subparsers(dest="command", required=True)
    n = sub.add_parser("new", help="create a deck from the template")
    n.add_argument("deck")
    n.add_argument("--title")
    n.set_defaults(run=cmd_new)

    def profile_option(parser):
        parser.add_argument("--profile", metavar="DIR", help="profile folder with profile.json and optional assets/ (default: $PYSLIDES_PROFILE); "
                            "its values sit between the default theme and Deck.theme")

    sub.add_parser("list", help="list decks in decks/").set_defaults(run=cmd_list)
    b = sub.add_parser("build", help="validate and build to <deck>/build")
    b.add_argument("deck")
    profile_option(b)
    b.set_defaults(run=cmd_build)
    s = sub.add_parser("serve", help="build and present on 127.0.0.1")
    s.add_argument("deck")
    s.add_argument("--port", type=int, default=8765)
    s.add_argument("--no-browser", action="store_true")
    profile_option(s)
    s.set_defaults(run=cmd_serve)
    f = sub.add_parser("pdf", help="export every slide and step to PDF (needs Node.js + Playwright)")
    f.add_argument("deck")
    f.add_argument("-o", "--output", help="default: <deck>/export/<name>.pdf")
    f.add_argument("--scale", type=float, default=2, help="pixel density of PDF pages (default 2)")
    f.add_argument("--vector", action="store_true", help="selectable text, vector figures and PDF links; <canvas>/WebGL is embedded as an image at --scale")
    profile_option(f)
    f.set_defaults(run=cmd_pdf)
    c = sub.add_parser("check", help="screenshot every slide and step, report overflow and page errors")
    c.add_argument("deck")
    c.add_argument("-o", "--output", help="default: <deck>/export/check")
    profile_option(c)
    c.set_defaults(run=cmd_check)
    a = p.parse_args(argv)
    return a.run(a)


if __name__ == "__main__":
    sys.exit(main())
