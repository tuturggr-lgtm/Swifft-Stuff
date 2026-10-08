# Drop the lobby theme here

Put the mp3 in **this folder**, named exactly:

```
Video Game Lobby (feat. Dashie).mp3
```

so that the full path is:

```
assets/audio/Video Game Lobby (feat. Dashie).mp3
```

That's it — the menu picks it up automatically on load (it's listed in
`assets/js/audio.js` as `TRACK`, with a couple of alternative spellings in
`TRACK_ALT` if you'd rather rename it: anything lowercase works too, e.g.
`video game lobby (feat. dashie).mp3`).

## Don't want to rename anything?

Drag the mp3 straight onto the menu window while it's open. The file never
leaves your machine — it's turned into a blob URL and played locally, and the
"NOW PLAYING" box in the top-right switches over to it.

## While the file is missing

Nothing breaks. The menu notices the 404, the music box in the top-right says
`drop the mp3 into assets/audio/`, and the UI blips (also generated locally
with WebAudio) keep working.
