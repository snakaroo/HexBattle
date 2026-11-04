# Hex Battle

A playable, local two-player card battle prototype on a 9 × 7 hex board with staggered rows and a roughly rectangular outline. No account, installation, or build step is needed.

## Play

Open `index.html` in a web browser. Or, if you have Python installed, run `python3 -m http.server 3000` here and visit `http://localhost:3000`.

Pass the screen to the other player when the handoff prompt appears. Click **How to play** in the game for the full rules.

## Prototype rules

- Each player starts with five cards, including a knight and an archer. Draw two at the beginning of subsequent turns, with a seven-card hand limit. Used cards are reshuffled when the deck runs out.
- Each turn has two actions. Playing one card or activating one character uses one action. An **Extra Attack** pickup grants one additional action that turn.
- Characters deploy only on their owner's edge. Supplies and terrain may be placed on any empty hex; whoever reaches a pickup first claims it.
- A knight, blacksmith, or thief moves/attacks an adjacent hex. An archer moves/attacks exactly two hexes along a straight hex direction. A ram attacks every hex along a three-hex line, advancing only if the route clears, then misses its next turn and takes extra damage while resting. A dragon breathes over two forward hexes and the two flanking the farther hex, including allies, then advances if possible.
- Attacking and moving are a single action. A character enters its destination if the target has been defeated or the fence destroyed. The dragon and ram have area attacks as described above.
- Defeat an enemy for 1 glory (a dragon for 2), or reach the opposite edge with a character for the first time for 2 glory. The first player to reach 6 glory wins.

This is an initial ruleset intended for playtesting. It uses local pass-and-play rather than an AI or online opponent, and game state is not saved when the page is closed.
