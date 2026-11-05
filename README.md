# Hex Battle

A playable, local two-player card battle prototype on a symmetric hex board with a customizable size. No account, installation, or build step is needed.

## Play

Open `index.html` in a web browser. Or, if you have Python installed, run `python3 -m http.server 3000` here and visit `http://localhost:3000`.

In New Game setup, choose 5–9 rows (default 5), 6–12 hexes in the shorter rows (default 8), and 1–5 actions per turn for both players (default 2). Alternate rows have one extra hex, so the default board is 5 rows of 8/9 hexes. Pass the screen to the other player when the handoff prompt appears. Click **How to play** in the game for the full rules.

## Prototype rules

- Each player starts with five cards, including a knight and an archer. Draw two at the beginning of subsequent turns, with a seven-card hand limit. Used cards are reshuffled when the deck runs out.
- Each turn has the shared action allowance chosen when starting that game (1–5). Playing one card or activating one character uses one action. Each character normally moves or attacks only once per turn; deploying it does not use its activation. An unsuccessful attack still counts. **Extra Attack** no longer gives the player an action: its collector stores one non-stacking second activation for a later turn or the current turn if there is another player action available. The first activation is normal and the second consumes the bonus; no character can act more than twice in one turn.
- Characters deploy only on their owner's edge. To place a supply or terrain card, select it and click **Roll to place**. This commits the card and one action. A 1 places it randomly; a 2–6 lets you choose an empty non-edge hex exactly that many hex steps from one of your active characters. A resting ram is not active, but a character that moved earlier this turn still is. If there is no active character or no hex at the rolled distance, placement is random instead. Items cannot go on either deployment edge or an occupied hex. If all non-edge hexes are occupied, item cards cannot be spent. Whoever reaches a pickup first claims it. Opponent items are completely hidden until revealed or encountered; even the battle log conceals their placement.
- A knight, blacksmith, or thief moves/attacks an adjacent hex. An archer moves/attacks exactly two hexes along a straight hex direction. A ram strikes up to three hexes along a line, entering cleared hexes and collecting their items in order. A surviving obstacle stops its travel but not its farther strikes; a fatal item ends the charge. A ram holding Extra Attack may charge twice in the same turn before it misses its next turn and takes extra damage while resting. A dragon breathes over two forward hexes and the two flanking the farther hex, including allies, then advances if possible.
- Soup of Seeing is a consumable card: use it directly on one of your own characters with a possible move, with no die roll. For one action it reveals a snapshot of hidden opponent items in the character's possible movement destinations until the end of your turn. For a ram, it includes all three hexes along each possible charge path. It does not move the character or heal it. A resting ram cannot use Soup. Multiple Soups combine their reveals. Confusion supplies now send an entering character back to its previous hex immediately.
- Attacking and moving are a single action. A character enters its destination if the target has been defeated or the fence destroyed. The dragon and ram have area attacks as described above.
- Defeat an enemy for 1 glory (a dragon for 2), or reach the opposite edge with a character for the first time for 2 glory. The first player to reach 6 glory wins.
- Item encounters show a brief on-board message describing the effect. Hits and shield blocks have visual cues and floating numbers. Multiple effects play in order without delaying actions; messages clear at turn handoff, and motion is reduced when requested by the device.
- The battlefield starts in a fixed isometric view with raised hexes. Use **View: Isometric / Flat** beside How to play and New game to switch at any time. The choice is remembered for the current browser session, including new games; the grid, rules, and hidden-item visibility are unchanged.

This is an initial ruleset intended for playtesting. It uses local pass-and-play rather than an AI or online opponent, and game state is not saved when the page is closed.

See [GLOSSARY.md](GLOSSARY.md) for the game's terms.
