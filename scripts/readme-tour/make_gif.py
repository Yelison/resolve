"""Builds the tour GIF from the frames recorded by record.mjs (no ffmpeg needed; only Pillow).

Usage: python make_gif.py <recording dir> <output.gif> [width=1000] [fps=10]
"""
import json
import sys
from pathlib import Path

from PIL import Image

src, out = Path(sys.argv[1]), Path(sys.argv[2])
width = int(sys.argv[3]) if len(sys.argv) > 3 else 1000
fps = int(sys.argv[4]) if len(sys.argv) > 4 else 10

rec = json.loads((src / "frames.json").read_text())
frames, start = rec["frames"], rec["start"]
duration = frames[-1]["t"] - start
images, cursor = [], 0
for i in range(int(duration * fps) + 1):
    t = start + i / fps
    while cursor + 1 < len(frames) and frames[cursor + 1]["t"] <= t:
        cursor += 1
    img = Image.open(src / "frames" / frames[cursor]["file"]).convert("RGB")
    img = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
    images.append(img.quantize(colors=128, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE))

out.parent.mkdir(parents=True, exist_ok=True)
images[0].save(out, save_all=True, append_images=images[1:], duration=round(1000 / fps), loop=0, optimize=True)
print(f"{len(images)} frames, {out.stat().st_size / 1e6:.2f} MB")
