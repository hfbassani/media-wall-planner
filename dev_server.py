#!/usr/bin/env python3
"""Media Wall Planner — Local Development Server & Auto-Builder.

Serves the workspace with no-cache headers for instant iteration,
and automatically watches src/ and dev.html to rebuild index.html
via build.sh when changes occur.
"""

import argparse
import http.server
import os
import socketserver
import subprocess
import sys
import threading
import time
from pathlib import Path

WORKSPACE_ROOT = Path(__file__).resolve().parent
SRC_DIR = WORKSPACE_ROOT / "src"
BUILD_SCRIPT = WORKSPACE_ROOT / "build.sh"
DEV_HTML = WORKSPACE_ROOT / "dev.html"
INDEX_HTML = WORKSPACE_ROOT / "index.html"


def run_build():
    """Execute build.sh to regenerate index.html."""
    try:
        res = subprocess.run(
            ["sh", str(BUILD_SCRIPT)],
            cwd=str(WORKSPACE_ROOT),
            capture_output=True,
            text=True,
            check=True,
        )
        msg = res.stdout.strip() or "built index.html"
        print(f"📦 [Auto-Build] {msg}", flush=True)
    except subprocess.CalledProcessError as e:
        print(f"❌ [Auto-Build Error] build.sh failed:\n{e.stderr}", file=sys.stderr, flush=True)
    except Exception as e:
        print(f"❌ [Auto-Build Error] {e}", file=sys.stderr, flush=True)


class DevHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    """HTTP request handler with disabled caching and convenient defaults."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WORKSPACE_ROOT), **kwargs)

    def end_headers(self):
        # Prevent browser caching during local development
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_GET(self):
        # Route root '/' to dev.html for active module development
        if self.path in ("/", "/index"):
            self.path = "/dev.html"
        return super().do_GET()

    def log_message(self, format, *args):
        # Clean formatted logging
        sys.stdout.write(f"🌐 [HTTP] {self.address_string()} - {format % args}\n")
        sys.stdout.flush()


def start_watcher():
    """Start file watcher using watchdog if available."""
    try:
        from watchdog.events import FileSystemEventHandler
        from watchdog.observers import Observer

        class BuildHandler(FileSystemEventHandler):
            def __init__(self):
                self._last_trigger = 0.0
                self._lock = threading.Lock()

            def on_any_event(self, event):
                if event.is_directory:
                    return
                # Only trigger on source files or dev harness
                src_path = Path(event.src_path)
                if src_path.name.startswith(".") or src_path.name.endswith("~"):
                    return
                if src_path == INDEX_HTML:
                    return

                now = time.time()
                with self._lock:
                    if now - self._last_trigger < 0.5:
                        return
                    self._last_trigger = now

                rel = src_path.relative_to(WORKSPACE_ROOT) if src_path.is_relative_to(WORKSPACE_ROOT) else src_path.name
                print(f"🔄 [Watch] Change detected in {rel}. Rebuilding...", flush=True)
                run_build()

        event_handler = BuildHandler()
        observer = Observer()
        if SRC_DIR.exists():
            observer.schedule(event_handler, str(SRC_DIR), recursive=True)
        observer.schedule(event_handler, str(DEV_HTML), recursive=False)
        observer.daemon = True
        observer.start()
        print("👀 [Watch] Watching src/ and dev.html for automatic index.html rebuilds.", flush=True)
        return observer
    except ImportError:
        print("ℹ️  [Watch] watchdog package not installed. Auto-build on file change is disabled.", flush=True)
        print("          Install with: pip install -r requirements.txt", flush=True)
        return None


class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    parser = argparse.ArgumentParser(description="Media Wall Planner Dev Server")
    parser.add_argument("--port", "-p", type=int, default=int(os.environ.get("PORT", 8080)), help="Port to serve on (default: 8080)")
    parser.add_argument("--host", default="127.0.0.1", help="Host address (default: 127.0.0.1)")
    parser.add_argument("--no-watch", action="store_true", help="Disable background watcher")
    parser.add_argument("--build", action="store_true", help="Run build.sh on startup")
    args = parser.parse_args()

    # Initial build
    if args.build or not INDEX_HTML.exists():
        run_build()

    # Watcher
    observer = None
    if not args.no_watch:
        observer = start_watcher()

    port = args.port
    host = args.host

    with ThreadedTCPServer((host, port), DevHTTPRequestHandler) as httpd:
        print("\n" + "=" * 60)
        print("✨ Media Wall Planner — Dev Server Running")
        print("=" * 60)
        print(f"  • Dev Harness (active src files):  http://{host}:{port}/dev.html")
        print(f"  • Production Bundle (index.html):  http://{host}:{port}/index.html")
        print(f"  • Default (root / -> dev.html):    http://{host}:{port}/")
        print("=" * 60)
        print("Press Ctrl+C to stop server.\n", flush=True)

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n🛑 Shutting down dev server...", flush=True)
        finally:
            if observer:
                observer.stop()
                observer.join()


if __name__ == "__main__":
    main()
