"""Build the portable ZIP. Run npm ci --ignore-scripts before executing."""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import urllib.request
import zipfile
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
VERSION = "45.5.0"
FILE = f"electron-v{VERSION}-win32-x64.zip"
SHA256 = "20155c8b8aa5b1f575f3757bdf21490e0bac2f19a65a26ce9ba99bcf9f2c69bd"
def build_installer(folder, out_dir, version):
    # Remove only files we install. Leave the separate data cache intact.
    remove_files = folder.parent / "remove-files.nsh"
    commands = []
    for item in sorted(folder.rglob("*"), reverse=True):
        relative = str(item.relative_to(folder)).replace("/", chr(92))
        command = "Delete" if item.is_file() else "RMDir"
        commands.append(f'{command} "$INSTDIR\\{relative}"')
    remove_files.write_text("\n".join(commands), encoding="utf-8")
    output = out_dir / f"Market-Scanner-{version}-Setup-x64.exe"
    defines = {"VERSION": version, "PAYLOAD": folder.resolve(), "OUTPUT": output.resolve(),
               "ICON": ROOT / "ui/icon.ico", "REMOVE_FILES": remove_files.resolve()}
    prefix = "/" if os.name == "nt" else "-"
    subprocess.run(["makensis", *(f"{prefix}D{k}={v}" for k, v in defines.items()),
                    str(ROOT / "scripts/setup.nsi")], check=True)
    print(output)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--runtime", type=Path, help="Previously downloaded official Electron ZIP")
    parser.add_argument("--out", type=Path, default=ROOT / "dist")
    parser.add_argument("--installer", action="store_true", help="Also build a per-user Windows setup EXE with NSIS")
    args = parser.parse_args()
    version = json.loads((ROOT / "package.json").read_text())["version"]
    args.out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=args.out) as tmp:
        work = Path(tmp)
        archive = args.runtime or work / FILE
        if not args.runtime:
            urllib.request.urlretrieve(f"https://github.com/electron/electron/releases/download/v{VERSION}/{FILE}", archive)
        with archive.open("rb") as f:
            if hashlib.file_digest(f, "sha256").hexdigest() != SHA256:
                raise RuntimeError("The Windows runtime differs from the official release checksum")
        folder = work / "Market-Scanner"
        with zipfile.ZipFile(archive) as z:
            z.extractall(folder)
        subprocess.run(["node", str(ROOT / "scripts/brand.mjs"), str(folder / "electron.exe"),
                        str(folder / "Market Scanner.exe"), str(ROOT / "ui/icon.ico")], check=True)
        (folder / "electron.exe").unlink()
        (folder / "resources/default_app.asar").unlink()
        app = folder / "resources/app"
        app.mkdir()
        for item in ["main.js", "preload.js", "engine.js", "provider.js", "metrics.js", "package.json"]:
            shutil.copy2(ROOT / item, app / item)
        for item in ["ui", "data"]:
            shutil.copytree(ROOT / item, app / item)
        shutil.copy2(ROOT / "START-HERE.txt", folder / "START-HERE.txt")
        dest = args.out / f"Market-Scanner-{version}-Windows-x64.zip"
        with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
            for item in sorted(folder.rglob("*")):
                if item.is_file():
                    z.write(item, item.relative_to(work))
        print(dest)
        if args.installer:
            build_installer(folder, args.out, version)
if __name__ == "__main__":
    main()
