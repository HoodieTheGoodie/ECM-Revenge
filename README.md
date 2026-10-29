# ECM-Revenge

Echo Maze 2: a browser-based top-down exploration prototype.

## Run

Because the game uses JavaScript modules, serve the project from a local web server:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` in a browser. Choose `Room Builder` from the main menu to author rooms, or open `http://localhost:8000/editor.html` directly.

Use the main menu to start or continue a game. During gameplay, use WASD or the arrow keys to move, hold `Shift` to sprint, press `Space` to attack, press `I` or the inventory button to open inventory, and press `Escape` to pause.

## Structure

- `src/core`: game loop, modes, input, and save data
- `src/entities`: player behavior
- `src/world`: editable room data, room transitions, and collision rules
- `src/rendering`: canvas drawing
- `src/ui`: health/stamina HUD and menus
- `src/main.js`: application entry point
- `editor.html`, `editor.js`, `editor.css`: room authoring tool

Hold `Shift` while moving to sprint. Sprinting drains the 100-point stamina bar; releasing Shift starts a two-second recharge delay. Emptying the bar completely adds a three-second sprint lockout while stamina continues recovering.

Room definitions in `src/world/rooms.js` are the current canonical level format. A future editor should write this format directly so authored rooms can be loaded by the game without a second level system.

The room builder currently starts with a tutorial hallway. Use `Room Door` to create a connected room, then click that door with `Select / Open Door` to build the connected room. Add walls, Maze Doors, colored Keys, Chasers, and chests, write future story or cutscene instructions in Room Notes, and export the authoring data as JSON.

Use `Playtest Room` to launch the selected room in the game. Use `Import Rooms` to restore an exported JSON collection and continue editing it; the runtime also loads the current authored collection for playtesting.

