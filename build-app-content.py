#!/usr/bin/env python3
"""
Regenerate app-content.json from the site source — the mirror pipeline.

Usage (from your site repo root, with this script and a base app-content.json present):

    python3 build-app-content.py

Reads:  index.html, episodes.json, app-content.json (as the base for config,
        news, events, merch — the hand-curated parts)
Writes: app-content.json with roster, episodes, polls, and themeAliases
        regenerated from the site source, and contentVersion bumped (UTC date).

Requires python3 + node (node evaluates the BIOS/THEME_ALIASES JS literals).
Run it after editing the roster, polls, or bios in index.html — or let the
GitHub Action (update-app-content.yml) run it on every push automatically.
The app refreshes from the hosted app-content.json on next launch.
"""
import html
import json
import re
import subprocess
import sys
import datetime

SEC_MAP = {
    "JCW Champions": "champion",
    "The Roster": "active",
    "Owners, Voices & Officials": "official",
    "Legends & Alumni": "legend",
}


def extract_js_object(text, start_marker):
    i = text.index(start_marker)
    i = text.index("{", i)
    depth = 0
    for j in range(i, len(text)):
        if text[j] == "{":
            depth += 1
        elif text[j] == "}":
            depth -= 1
            if depth == 0:
                return text[i:j + 1]
    raise ValueError("unbalanced braces after " + start_marker)


def clean(s):
    s = re.sub(r"<[^>]+>", "", s or "")
    s = re.sub(r"\s+", " ", s)
    # Full standard entity decode (&mdash; &middot; &amp; &#39; … all of them).
    # The app renders native text, not HTML — entities must never reach the feed.
    return html.unescape(s).strip()


def deep_unescape(x):
    """Belt-and-braces: decode entities in EVERY string of the final feed,
    whatever code path produced it (BIOS via node, carried-over base fields…)."""
    if isinstance(x, str):
        return html.unescape(x)
    if isinstance(x, list):
        return [deep_unescape(v) for v in x]
    if isinstance(x, dict):
        return {k: deep_unescape(v) for k, v in x.items()}
    return x


def main():
    src = open("index.html", encoding="utf-8").read()
    base = json.load(open("app-content.json", encoding="utf-8"))

    # BIOS + THEME_ALIASES via node (they're JS object literals)
    bios_js = extract_js_object(src, "const BIOS=")
    aliases_js = extract_js_object(src, "const THEME_ALIASES=")
    node_out = subprocess.run(
        ["node", "-e",
         "const BIOS=" + bios_js + ";const A=" + aliases_js +
         ";console.log(JSON.stringify({bios:BIOS,aliases:A}))"],
        capture_output=True, text=True, check=True,
    )
    parsed = json.loads(node_out.stdout)
    BIOS, ALIASES = parsed["bios"], parsed["aliases"]

    # roster from the #view-crew .wr blocks
    tag_positions = [(m.start(), clean(m.group(1)))
                     for m in re.finditer(r'<div class="tag">([^<]*)</div>', src)]
    roster = []
    for m in re.finditer(
        r'<div class="wr"(?:\s+data-line="([^"]*)")?[^>]*>.*?roster/([a-z0-9-]+)\.jpg'
        r'.*?(?:<span class="hof">([^<]*)</span>)?\s*(?:<div class="role">(.*?)</div>)?\s*<h3>(.*?)</h3>',
        src, re.S,
    ):
        section = ""
        for tp, tt in tag_positions:
            if tp < m.start():
                section = tt
            else:
                break
        slug = m.group(2)
        name = clean(m.group(5))
        champ = bool((m.group(3) or "").strip())
        division = "champion" if champ else SEC_MAP.get(section, "active")
        entry = BIOS.get(name) or {}
        roster.append({
            "id": slug,
            "name": name,
            "role": clean(m.group(4)) or ("JCW Champion" if champ else "JCW Roster"),
            "division": division,
            "imageUrl": f"https://jcwlunacy.net/roster/{slug}.jpg",
            "facts": [str(f) for f in (entry.get("f") or [])],
            "tagline": clean(m.group(1)),
            "themeTitle": "",
        })

    # episodes from episodes.json (oldest→newest) → newest first for the app
    eps = json.load(open("episodes.json", encoding="utf-8"))
    episodes = []
    for yt, title in eps:
        num = re.match(r"Episode (\d+)", title)
        episodes.append({
            "id": f"yt-{yt}",
            "number": int(num.group(1)) if num else 0,
            "title": title, "date": "", "description": "",
            "videoUrl": f"https://youtu.be/{yt}", "featured": False,
        })
    episodes.reverse()
    if episodes:
        episodes[0]["featured"] = True

    # polls from the .ch-poll blocks
    polls = []
    for pm in re.finditer(
        r'<div class="ch-poll" data-poll="([^"]+)">\s*<h5>(.*?)</h5>(.*?)</div>', src, re.S
    ):
        options = [clean(o) for o in re.findall(r"<span>(.*?)</span>", pm.group(3), re.S)]
        polls.append({"key": pm.group(1), "q": clean(pm.group(2)), "options": options})

    base["roster"] = roster
    base["episodes"] = episodes
    base["polls"] = polls
    base["themeAliases"] = ALIASES
    base["contentVersion"] = int(datetime.datetime.utcnow().strftime("%Y%m%d"))
    base = deep_unescape(base)

    json.dump(base, open("app-content.json", "w", encoding="utf-8"),
              indent=1, ensure_ascii=False)
    open("app-content.json", "a").write("\n")
    print(f"app-content.json regenerated · {len(roster)} roster · "
          f"{len(episodes)} episodes · {len(polls)} polls · v{base['contentVersion']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
