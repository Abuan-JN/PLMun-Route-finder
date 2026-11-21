# PLMUN Campus Route Finder

A browser-based implementation of the proposal **“Design and Development of a Problem-Solving Agent: PLMUN Campus Route Finder”** (Group 11, CSELEC3). It models campus locations as a weighted graph and uses an **A\*** agent with a Euclidean heuristic to compute optimal walking routes in real time.

## Run it

No build step or dependencies are required.

- Open `index.html` directly in a browser, or
- Serve the folder locally:

  ```bash
  python -m http.server 8765
  ```

  then visit `http://localhost:8765/index.html`.

## What the app does

- Select an initial state and goal state from the dropdowns, or click nodes on the map (use the **Start / Destination** toggle to choose what a click sets).
- Click **Find optimal route** — or just change a selection; routes recompute automatically.
- Toggle path closures under **Path conditions** to force the agent to replan around obstacles.
- View total distance, the node sequence, turn-by-turn directions, the A\* expansion trace, and a Dijkstra comparison that verifies optimality and shows how many fewer nodes A\* expanded.
- Switch between light and dark themes; the choice is remembered locally.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page structure and inline SVG icon set |
| `styles.css` | Design tokens, responsive layout, light/dark themes |
| `campus-data.js` | Schematic campus graph: nodes, coordinates, weighted edges, obstacles |
| `astar.js` | Binary min-heap, A\* search, Dijkstra baseline, heuristic validation |
| `app.js` | UI controller, SVG map rendering, directions and results |
| `tests/astar.test.js` | Node.js test suite for the search engine |

## Mapping to the proposal

| Proposal component | Implementation |
| --- | --- |
| Campus map database (nodes, edges, costs, coordinates) | `campus-data.js` |
| Graph representation / adjacency structure | `CampusData.createGraph()` |
| A\* search agent, `f(n) = g(n) + h(n)` | `RouteAgent.aStar()` with a binary min-heap |
| Heuristic calculator (Euclidean distance) | `RouteAgent.euclidean()` |
| Route processor (parent pointers) | Path reconstruction in `astar.js` |
| Route presentation (sequence, distance, directions) | `app.js` result rendering |
| Path & obstacle management | Checkbox-driven blocked edge set |
| Evaluation of optimality / expansion efficiency | Dijkstra baseline, expansion metrics, heuristic admissibility check |

## Tests

```bash
node --test tests/astar.test.js
```

The suite verifies A\*/Dijkstra cost equality for every start–goal pair, heuristic admissibility across all 400 pairs, obstacle avoidance, unreachable cases, and heap ordering.

## Data note

The campus layout is a **schematic teaching dataset** built from the proposal's examples (Main Gate, Building A, Library, etc.). It is not a surveyed map of PLMUN. Edge costs are derived from coordinate distances multiplied by walking detour factors (always ≥ 1, keeping the Euclidean heuristic admissible).
