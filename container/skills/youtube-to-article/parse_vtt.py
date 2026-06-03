#!/usr/bin/env python3
"""Parse a YouTube auto-caption .vtt into a clean transcript.

Usage: python3 parse_vtt.py <file.vtt> [out_dir]

Writes <out_dir>/transcript.txt (flat) and transcript_timed.txt ([mm:ss] line),
stripping inline <...> timing tags and de-duplicating the rolling-caption repeats
that YouTube auto-captions produce.
"""
import re
import sys
import os


def to_seconds(ts: str) -> float:
    h, m, s = ts.split(":")
    return int(h) * 3600 + int(m) * 60 + float(s)


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit("usage: parse_vtt.py <file.vtt> [out_dir]")
    path = sys.argv[1]
    out_dir = sys.argv[2] if len(sys.argv) > 2 else os.path.dirname(os.path.abspath(path)) or "."
    lines = open(path, encoding="utf-8").read().splitlines()

    segs = []  # (start_seconds, text)
    cur_start = None
    cue = re.compile(r"(\d\d:\d\d:\d\d\.\d\d\d) --> (\d\d:\d\d:\d\d\.\d\d\d)")
    for line in lines:
        m = cue.match(line)
        if m:
            cur_start = to_seconds(m.group(1))
            continue
        if cur_start is not None and line.strip():
            txt = re.sub(r"<[^>]+>", "", line).strip()  # drop inline timing tags
            if txt:
                segs.append((cur_start, txt))
            cur_start = None

    # collapse consecutive duplicate lines (rolling-caption artifact)
    clean = []
    for s, t in segs:
        if clean and clean[-1][1] == t:
            continue
        clean.append((s, t))

    full = re.sub(r"\s+", " ", " ".join(t for _, t in clean)).strip()
    with open(os.path.join(out_dir, "transcript.txt"), "w") as f:
        f.write(full)
    with open(os.path.join(out_dir, "transcript_timed.txt"), "w") as f:
        for s, t in clean:
            f.write(f"[{int(s // 60):02d}:{int(s % 60):02d}] {t}\n")

    print(f"segments: {len(clean)}")
    print(f"words: {len(full.split())}")
    if clean:
        print(f"duration: ~{int(clean[-1][0] // 60)} min")


if __name__ == "__main__":
    main()
