---
name: youtube-to-article
description: Turn a YouTube video into a written markdown article with slide images and code snippets, saved into the Obsidian vault. Use when the user gives a YouTube URL and wants an article / write-up / notes / blog post extracted from it. Triggers - "youtube to article", "make an article from this video", "write up this talk", "/youtube-to-article <url>".
---

# YouTube → Article

Convert a YouTube video into a clean, illustrated markdown article: pull the
transcript, capture the meaningful slides/diagrams/code as images, read on-screen
content with vision, and synthesize a structured article saved to the Obsidian
vault.

Default output: `/workspace/extra/vault/Articles/<Title>.md`, with images in
`/workspace/extra/vault/Articles/attachments/<slug>/`. Embed images with
Obsidian wiki-embeds: `![[attachments/<slug>/01-foo.jpg]]`.

## Prerequisites (already installed)

- `ffmpeg` (system) — frame extraction.
- `yt-dlp` (system) — but the apt build is often too old and fails on YouTube.
  **Always use the bundled fresh zipapp** at `skills/youtube-to-article/yt-dlp.pyz`
  via `python3`. Re-download it if missing (see step 0).
- All `yt-dlp` calls go through the OneCLI proxy, which presents a self-signed
  cert — **always pass `--no-check-certificates`**.

## Workflow

Work in a scratch dir (e.g. `/workspace/agent/yt-work`). Send a short
mid-turn update before the slow steps (video download, frame review).

### 0. Ensure a working yt-dlp

```bash
YTDLP="/workspace/agent/skills/youtube-to-article/yt-dlp.pyz"
[ -f "$YTDLP" ] || curl -sL --insecure -o "$YTDLP" \
  https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp
yt() { python3 "$YTDLP" --no-check-certificates --no-warnings "$@"; }
```

NOTE: the standalone `yt-dlp_linux` binary is x86-64 and fails on this arm64
host (rosetta error). The `.pyz` zipapp is arch-independent — use it.

### 1. Metadata + transcript

```bash
yt --skip-download --print "%(title)s|||%(duration)s|||%(uploader)s|||%(upload_date)s" "$URL"
yt --skip-download --write-auto-subs --sub-langs "en" --sub-format vtt -o "video.%(ext)s" "$URL"
```

Parse the VTT into a clean transcript with `parse_vtt.py` (bundled): it strips
inline timing tags and de-duplicates the rolling-caption repeats, writing
`transcript.txt` (flat) and `transcript_timed.txt` (`[mm:ss] line`).

```bash
python3 /workspace/agent/skills/youtube-to-article/parse_vtt.py video.en.vtt
```

If no English auto-subs exist, run `yt --list-subs "$URL"` and pick the best
available language, or fall back to transcribing audio.

### 2. Download a low-res copy (fast)

```bash
yt -f "bestvideo[height<=480]+bestaudio/best[height<=480]" --merge-output-format mp4 \
   -o "video.%(ext)s" "$URL"
```

### 3. Find the meaningful frames

Two complementary passes — slides change at irregular intervals, so combine:

```bash
# a) scene-change detection (slide transitions). Parse pts_time for timestamps.
ffmpeg -hide_banner -i video.mp4 -vf "select='gt(scene,0.25)',metadata=print:file=scenes.txt" \
  -vsync vfr frames/slide_%03d.jpg 2>/dev/null
grep -o "pts_time:[0-9.]*" scenes.txt | sed 's/pts_time://'

# b) uniform grid every ~45s for full coverage (fills scene-detection gaps)
ffmpeg -hide_banner -loglevel error -i video.mp4 -vf "fps=1/45" -vsync vfr grid/t_%02d.jpg
```

### 4. Review frames visually (this is the key step — use vision, not OCR)

Tile frames into contact sheets and Read them to decide what each shows:

```bash
ffmpeg -hide_banner -loglevel error -pattern_type glob -i 'grid/t_*.jpg' \
  -vf "scale=320:-1,tile=5x3" grid_sheet_%02d.jpg
```

Read the contact sheets. Grid frame `t_NN` is at roughly `(NN-1)*45` seconds, but
**verify** by extracting a few exact-second frames and reading them — the mapping
drifts, so confirm a slide's timestamp before trusting it.

### 5. Extract chosen slides at full res; crop code/text for legibility

```bash
ffmpeg -hide_banner -loglevel error -ss <sec> -i video.mp4 -frames:v 1 -q:v 2 out.jpg
# For dense code/text slides, crop off the speaker-cam band and upscale:
ffmpeg -hide_banner -loglevel error -i out.jpg -vf "crop=in_w:in_h*0.72:0:0,scale=1280:-1" out_crop.jpg
```

Read the cropped code/text slides carefully and **transcribe them into real
fenced code blocks** in the article (vision transcription beats OCR for code).
If the video links a GitHub repo or puts code in the description, prefer that
source over reading it off the screen.

### 6. Write the article

- Copy the curated images (aim for ~6–10) into
  `/workspace/extra/vault/Articles/attachments/<slug>/` with ordered, descriptive
  names (`01-...jpg`).
- Structure: frontmatter (title, source URL, speaker, event, tags, created) →
  TL;DR callout → sectioned walkthrough following the talk's arc, each major point
  paired with its slide image and any transcribed code → a takeaways/summary
  section → a provenance note.
- Use Obsidian callouts (`> [!abstract]`, `> [!tip]`, `> [!quote]`,
  `> [!warning]`) and `![[...]]` embeds.
- Quotes: lightly clean auto-caption text; mark code/PR text as transcribed from
  slides.

### 7. Clean up + deliver

Delete the heavy scratch artifacts (`video.mp4`, `frames/`, `grid/`, contact
sheets) — keep `yt-dlp.pyz`. Then `send_file` the finished `.md` and tell the
user where it landed in the vault.

## Honest caveats to surface to the user

- **On-screen code** is best-effort vision transcription — small errors possible;
  prefer linked repos / description code when available.
- **Talk-heavy videos** (few slides) yield few images — that's expected.
- If `yt-dlp` still fails (YouTube anti-bot changes), report it rather than
  producing a transcript-less article.
