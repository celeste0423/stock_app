from __future__ import annotations

import socket
import os
import subprocess
import sys
import threading
import time
import traceback
import urllib.request
import webbrowser
from pathlib import Path
from typing import Any


BASE_DIR = Path(__file__).resolve().parent
VENDOR_DIR = BASE_DIR / "backend" / "vendor"
LOG_PATH = BASE_DIR / "desktop_app.log"
HOST = "127.0.0.1"
START_PORT = 8124
APP_TITLE = "Stock Dashboard"
EDGE_PROFILE_DIR = BASE_DIR / "desktop_edge_profile"


def log(message: str) -> None:
    stamp = time.strftime("%Y-%m-%d %H:%M:%S")
    LOG_PATH.write_text(
        (LOG_PATH.read_text(encoding="utf-8") if LOG_PATH.exists() else "")
        + f"[{stamp}] {message}\n",
        encoding="utf-8",
    )


def configure_imports() -> None:
    sys.path.insert(0, str(BASE_DIR))
    if VENDOR_DIR.exists():
        sys.path.insert(0, str(VENDOR_DIR))


def find_free_port(start_port: int = START_PORT, attempts: int = 30) -> int:
    for port in range(start_port, start_port + attempts):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind((HOST, port))
            except OSError:
                continue
            return port
    raise RuntimeError("No free local port is available for the desktop app.")


def wait_for_server(url: str, timeout: float = 30.0) -> None:
    deadline = time.time() + timeout
    last_error: Exception | None = None
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1.5) as response:
                if response.status == 200:
                    return
        except Exception as exc:
            last_error = exc
        time.sleep(0.25)
    raise RuntimeError(f"Desktop app server did not start in time: {last_error}")


def find_edge_executable() -> Path | None:
    env_path = os.getenv("STOCK_DASHBOARD_EDGE_EXE")
    candidates = [
        Path(env_path) if env_path else None,
        Path(os.getenv("ProgramFiles(x86)", "C:/Program Files (x86)")) / "Microsoft/Edge/Application/msedge.exe",
        Path(os.getenv("ProgramFiles", "C:/Program Files")) / "Microsoft/Edge/Application/msedge.exe",
        Path(os.getenv("LOCALAPPDATA", "")) / "Microsoft/Edge/Application/msedge.exe",
    ]
    for candidate in candidates:
        if candidate and candidate.exists():
            return candidate
    return None


def open_edge_app_window(url: str) -> subprocess.Popen[bytes] | None:
    edge_exe = find_edge_executable()
    if not edge_exe:
        return None
    EDGE_PROFILE_DIR.mkdir(exist_ok=True)
    command = [
        str(edge_exe),
        f"--app={url}",
        "--new-window",
        "--no-first-run",
        f"--user-data-dir={EDGE_PROFILE_DIR}",
    ]
    return subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def edge_profile_processes_alive() -> bool:
    profile = str(EDGE_PROFILE_DIR)
    ps_profile = profile.replace("'", "''")
    command = (
        "$profile = '" + ps_profile + "'; "
        "$count = (Get-CimInstance Win32_Process | "
        "Where-Object { $_.Name -eq 'msedge.exe' -and $_.CommandLine -like ('*' + $profile + '*') } | "
        "Measure-Object).Count; "
        "Write-Output $count"
    )
    try:
        result = subprocess.run(
            ["powershell.exe", "-NoProfile", "-Command", command],
            capture_output=True,
            text=True,
            timeout=5,
        )
        return int((result.stdout or "0").strip().splitlines()[-1]) > 0
    except Exception as exc:
        log(f"Could not check Edge app process state: {exc}")
        return False


def run_edge_app_window(url: str, server: Any, thread: threading.Thread) -> bool:
    process = open_edge_app_window(url)
    if not process:
        return False
    log("Opening Edge app window")
    try:
        started_at = time.time()
        while True:
            process_exited = process.poll() is not None
            profile_alive = edge_profile_processes_alive()
            if process_exited and not profile_alive and time.time() - started_at > 5:
                break
            time.sleep(1.5)
    finally:
        log("Stopping desktop app")
        server.should_exit = True
        thread.join(timeout=5)
    return True


def main() -> None:
    log("Starting desktop app")
    configure_imports()

    import uvicorn
    from backend.app import app

    port = find_free_port()
    base_url = f"http://{HOST}:{port}"
    app_version = int(max(
        (BASE_DIR / "frontend" / "index.html").stat().st_mtime,
        (BASE_DIR / "frontend" / "static" / "app.js").stat().st_mtime,
        (BASE_DIR / "frontend" / "static" / "styles.css").stat().st_mtime,
    ))
    app_url = f"{base_url}/?desktop_v={app_version}"
    health_url = f"{base_url}/api/health"

    config = uvicorn.Config(
        app,
        host=HOST,
        port=port,
        log_level="warning",
        access_log=False,
    )
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, name="stock-dashboard-server", daemon=True)
    thread.start()
    wait_for_server(health_url)
    log(f"Server is healthy at {base_url}")

    if "--check-server" in sys.argv:
        print(f"Desktop app server is healthy: {base_url}")
        server.should_exit = True
        thread.join(timeout=5)
        return

    desktop_mode = os.getenv("STOCK_DASHBOARD_DESKTOP_MODE", "edge_app").strip().lower()
    if desktop_mode in {"edge", "edge_app", "edge-app"}:
        if run_edge_app_window(app_url, server, thread):
            return
        log("Edge app mode failed because msedge.exe was not found; trying pywebview")

    try:
        import webview
    except Exception as exc:
        log(f"pywebview import failed, falling back to browser: {exc}")
        webbrowser.open(base_url)
        print("pywebview is not available, so the app was opened in your default browser.")
        try:
            while thread.is_alive():
                time.sleep(1)
        except KeyboardInterrupt:
            pass
        finally:
            server.should_exit = True
        return

    try:
        webview.create_window(
            APP_TITLE,
            app_url,
            width=1500,
            height=950,
            min_size=(1100, 720),
            focus=True,
            on_top=False,
            text_select=True,
        )
        log("Opening pywebview window")
        webview.start(gui="edgechromium")
    finally:
        log("Stopping desktop app")
        server.should_exit = True
        thread.join(timeout=5)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        log("Fatal desktop app error:\n" + traceback.format_exc())
        raise
