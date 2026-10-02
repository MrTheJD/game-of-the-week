# Game of the Week

A sandbox of little browser games, made for fun. Plain HTML, CSS and JavaScript: no build step, nothing to install.
Everything saves on the phone it's played on.

**Play:** https://mrthejd.github.io/game-of-the-week/ (on iPhone: Share → Add to Home Screen)

## Games

| Game | What it is |
| --- | --- |
| [Pack Rip](games/pack-rip/) | A pack-ripping app like Rips: buy packs with play money, rip them, pull real Pokémon cards at real market prices, sell back or keep. |

## Layout

```
index.html            the hub: a tile per game
games.js              the list of games on the hub
sw.js                 offline support for everything
manifest.webmanifest  one home-screen icon for the hub
shared/               small helpers any game can use (storage, haptics, base styles)
games/<name>/         one folder per game; each one stands on its own
tools/                scripts that build game data
```

## Adding a game

1. Make a folder `games/<name>/` with an `index.html` (copy the `<head>` from Pack Rip for the shared styles).
2. Add one line to `games.js`.
3. Save with `shared/storage.js` under the game's own name, so games never share saves.

## Pack Rip card data

`games/pack-rip/data/cards.json` is a snapshot of card names, images and TCGplayer market prices from the free
[Pokémon TCG API](https://pokemontcg.io). To refresh prices:

```
node tools/build-pack-rip-data.mjs
ONLY=sv8pt5,sv2 node tools/build-pack-rip-data.mjs   # just these sets, keep the rest
```

Packs are set up in `games/pack-rip/packs.js` (price, which sets, value window, colors). The odds are worked out from
the real cards in each pack so that the average pull matches the "Pack return" setting in the game.

Pokémon card names and images belong to their owners. This is a personal, non-commercial project with no real money.
