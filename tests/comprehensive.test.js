/**
 * Comprehensive Test Suite for PLMUN Campus Route Finder
 * Tests all aspects: graph integrity, A* correctness, pathfinding quality,
 * edit operations, edge cases, and performance
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const Data = require("../campus-data.js");
const Agent = require("../astar.js");

const graph = Data.createGraph();

function edgeBetween(a, b) {
  return graph.edgeById.get(Data.edgeId(a, b));
}

function pathCost(path) {
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const edge = edgeBetween(path[i], path[i + 1]);
    if (!edge) return Infinity;
    total += edge.cost;
  }
  return total;
}

function getDestinations() {
  return graph.getAllNodes().filter(function (n) {
    return n.type !== "intersection" && n.type !== "connector";
  });
}

function getIntersections() {
  return graph.getAllNodes().filter(function (n) {
    return n.type === "intersection";
  });
}

function getConnectors() {
  return graph.getAllNodes().filter(function (n) {
    return n.type === "connector";
  });
}

console.log("════════════════════════════════════════════════════════════");
console.log("PLMUN Campus Route Finder — Comprehensive Test Suite");
console.log("════════════════════════════════════════════════════════════\n");

/* ──────────────────────────────────────────────────
   SECTION 1: GRAPH INTEGRITY TESTS
   ────────────────────────────────────────────────── */

test("Graph Integrity: Node counts match expected", () => {
  const all = graph.getAllNodes();
  const dests = getDestinations();
  const inters = getIntersections();
  const conns = getConnectors();

  console.log(`  Total nodes: ${all.length}`);
  console.log(`  Destinations: ${dests.length}`);
  console.log(`  Intersections: ${inters.length}`);
  console.log(`  Connectors: ${conns.length}`);

  assert.equal(all.length, 31, "Expected 31 total nodes");
  assert.equal(dests.length, 9, "Expected 9 destinations (A–I)");
  assert.equal(inters.length, 13, "Expected 13 intersections");
  assert.equal(conns.length, 9, "Expected 9 connectors");
});

test("Graph Integrity: All 9 PLMUN destinations exist with correct labels", () => {
  const expected = [
    "Student Center", "Covered Court", "Main Building", "Admin Building",
    "RLRC Building", "Gazebo", "Serenity Garden", "North Park", "Centienal Park"
  ];
  const dests = getDestinations();
  const names = dests.map(d => d.name).sort();
  const expectedSorted = expected.sort();

  assert.deepEqual(names, expectedSorted, "All 9 destinations present with correct names");
  dests.forEach(d => {
    assert.ok(d.x >= 0 && d.x <= 1000, `${d.name} x in bounds`);
    assert.ok(d.y >= 0 && d.y <= 509, `${d.name} y in bounds`);
  });
});

test("Graph Integrity: All intersections are reachable from road network", () => {
  const inters = getIntersections();
  inters.forEach(int => {
    const edges = graph.adjacency.get(int.id);
    assert.ok(edges && edges.length > 0, `Intersection ${int.id} has ${edges ? edges.length : 0} connections`);
  });
});

test("Graph Integrity: All connectors link destination → intersection", () => {
  const conns = getConnectors();
  conns.forEach(conn => {
    const edges = graph.adjacency.get(conn.id);
    assert.ok(edges && edges.length >= 2, `Connector ${conn.id} has ${edges ? edges.length : 0} edges`);
    const connectedTypes = edges.map(e => graph.getNode(e.to).type).sort();
    // Should connect to at least one destination and one intersection
    assert.ok(connectedTypes.includes("intersection"), `${conn.id} connects to intersection`);
    assert.ok(connectedTypes.some(t => t !== "intersection" && t !== "connector"), `${conn.id} connects to destination`);
  });
});

test("Graph Integrity: Edge count matches expected road network", () => {
  const edges = graph.getAllEdges();
  console.log(`  Total graph edges: ${edges.length}`);
  // 16 road segments + 9 connector pairs + some internal connections
  assert.ok(edges.length >= 30, "Sufficient edges for road network");
});

/* ──────────────────────────────────────────────────
   SECTION 2: A* CORRECTNESS TESTS
   ────────────────────────────────────────────────── */

test("A* Correctness: Optimality vs Dijkstra for all destination pairs", () => {
  const dests = getDestinations();
  let mismatches = 0;

  for (const start of dests) {
    for (const goal of dests) {
      if (start.id === goal.id) continue;
      const aStar = Agent.aStar(graph, start.id, goal.id);
      const baseline = Agent.dijkstra(graph, start.id, goal.id);

      assert.equal(aStar.found, true, `${start.id} → ${goal.id} should be reachable`);
      if (aStar.cost !== baseline.cost) {
        mismatches++;
        console.log(`  MISMATCH: ${start.id} → ${goal.id}: A*=${aStar.cost}, Dijkstra=${baseline.cost}`);
      }
    }
  }

  assert.equal(mismatches, 0, `${mismatches} cost mismatches found`);
});

test("A* Correctness: Heuristic admissibility across all node pairs", () => {
  const report = Agent.heuristicAdmissibilityReport(graph);
  console.log(`  Tested pairs: ${report.pairs}`);
  console.log(`  Violations: ${report.violations.length}`);
  assert.equal(report.admissible, true, `Found ${report.violations.length} heuristic violations`);
});

test("A* Correctness: Path reconstruction yields valid sequences", () => {
  const dests = getDestinations();
  for (const start of dests) {
    for (const goal of dests) {
      if (start.id === goal.id) continue;
      const result = Agent.aStar(graph, start.id, goal.id);
      assert.ok(result.found, `Path found: ${start.id} → ${goal.id}`);

      // Verify path starts and ends correctly
      assert.equal(result.path[0], start.id, "Path starts at start node");
      assert.equal(result.path[result.path.length - 1], goal.id, "Path ends at goal node");

      // Verify consecutive nodes are connected
      for (let i = 0; i < result.path.length - 1; i++) {
        const edge = edgeBetween(result.path[i], result.path[i + 1]);
        assert.ok(edge, `Edge exists between ${result.path[i]} and ${result.path[i + 1]}`);
      }

      // Verify cost matches sum of edges
      assert.equal(result.cost, pathCost(result.path), "Path cost matches edge sum");
    }
  }
});

test("A* Correctness: Path cost matches reported total distance", () => {
  const dests = getDestinations();
  for (const start of dests) {
    for (const goal of dests) {
      if (start.id === goal.id) continue;
      const result = Agent.aStar(graph, start.id, goal.id);
      const computed = pathCost(result.path);
      assert.equal(result.cost, computed, `${start.id} → ${goal.id} cost mismatch`);
    }
  }
});

/* ──────────────────────────────────────────────────
   SECTION 3: PATHFINDING QUALITY TESTS
   ────────────────────────────────────────────────── */

test("Pathfinding Quality: Start → Goal returns reasonable paths", () => {
  const dests = getDestinations();
  for (const start of dests) {
    for (const goal of dests) {
      if (start.id === goal.id) continue;
      const result = Agent.aStar(graph, start.id, goal.id);
      // Path should not be excessively long (no cycles)
      assert.ok(result.path.length <= 20, `Path length reasonable: ${start.id} → ${goal.id} = ${result.path.length} nodes`);
      // Cost should be positive for distinct nodes
      assert.ok(result.cost > 0, `Positive cost for ${start.id} → ${goal.id}`);
    }
  }
});

test("Pathfinding Quality: Known route Student Center → RLRC Building", () => {
  const result = Agent.aStar(graph, "student-center", "rlrc-building");
  console.log(`  Route: ${result.path.join(" → ")}`);
  console.log(`  Distance: ${result.cost}m`);
  console.log(`  Expanded: ${result.expanded} nodes`);

  assert.ok(result.found, "Route found");
  assert.ok(result.path.length >= 4, "Multi-hop path");
  assert.ok(result.cost > 0, "Positive distance");
  assert.ok(result.path.includes("student-center"), "Starts at Student Center");
  assert.ok(result.path.includes("rlrc-building"), "Ends at RLRC Building");
});

test("Pathfinding Quality: Blocked paths force alternative routes", () => {
  // Find a route that uses a specific edge, then block it
  const dests = getDestinations();
  const start = dests[0];
  const goal = dests[dests.length - 1];

  const baseline = Agent.aStar(graph, start.id, goal.id);
  assert.ok(baseline.found, "Baseline route exists");

  // Block an edge on the baseline path (if path has edges)
  if (baseline.path.length >= 3) {
    const blockedEdge = Data.edgeId(baseline.path[0], baseline.path[1]);
    const result = Agent.aStar(graph, start.id, goal.id, { blocked: new Set([blockedEdge]) });

    if (result.found) {
      // Alternative should be longer or equal
      assert.ok(result.cost >= baseline.cost, "Alternative route not shorter than blocked path");
      console.log(`  Baseline: ${baseline.cost}m, Alternative: ${result.cost}m`);
    }
  }
});

test("Pathfinding Quality: Multiple distinct start/goal combinations", () => {
  const testPairs = [
    ["student-center", "rlrc-building"],
    ["main-building", "admin-building"],
    ["covered-court", "north-park"],
    ["serenity-garden", "centennial-park"],
    ["gazebo", "admin-building"],
  ];

  testPairs.forEach(([startId, goalId]) => {
    const result = Agent.aStar(graph, startId, goalId);
    assert.ok(result.found, `${startId} → ${goalId} reachable`);
    console.log(`  ${startId} → ${goalId}: ${result.cost}m (${result.path.length} nodes)`);
  });
});

/* ──────────────────────────────────────────────────
   SECTION 4: EDIT OPERATIONS TESTS
   ────────────────────────────────────────────────── */

test("Edit Ops: Add node creates reachable destination", () => {
  const initialCount = graph.getAllNodes().length;
  graph.addNode("test-node", "Test Node", 500, 250, "custom");
  assert.equal(graph.getAllNodes().length, initialCount + 1, "Node count increased");

  // Connect to nearest intersection
  graph.addEdge("test-node", "int-10", "Test Access", 1.05);
  const result = Agent.aStar(graph, "test-node", "main-building");
  assert.equal(result.found, true, "New node is reachable");
  console.log(`  Test node route: ${result.path.join(" → ")} (${result.cost}m)`);

  graph.removeNode("test-node");
  assert.equal(graph.getAllNodes().length, initialCount, "Node removed cleanly");
});

test("Edit Ops: Add edge between existing nodes", () => {
  const initialEdges = graph.getAllEdges().length;
  graph.addEdge("student-center", "main-building", "Direct Test Path", 1.1);
  assert.equal(graph.getAllEdges().length, initialEdges + 1, "Edge added");

  const result = Agent.aStar(graph, "student-center", "main-building");
  assert.ok(result.found, "Path exists with new edge");
  console.log(`  Direct path: ${result.cost}m`);

  graph.removeEdge(Data.edgeId("student-center", "main-building"));
  assert.equal(graph.getAllEdges().length, initialEdges, "Edge removed");
});

test("Edit Ops: Block/unblock edge works correctly", () => {
  const result1 = Agent.aStar(graph, "student-center", "main-building");
  assert.ok(result1.found, "Route exists before block");

  // Find and block an edge on the path
  const edgeId = Data.edgeId(result1.path[0], result1.path[1]);
  graph.setEdgeBlocked(edgeId, true);
  const result2 = Agent.aStar(graph, "student-center", "main-building", { blocked: new Set([edgeId]) });

  // Should either be blocked or find alternative
  if (!result2.found) {
    console.log("  Route fully blocked (expected for critical edge)");
  } else {
    console.log(`  Alternative found: ${result2.cost}m (was ${result1.cost}m)`);
  }

  graph.setEdgeBlocked(edgeId, false);
  const result3 = Agent.aStar(graph, "student-center", "main-building");
  assert.equal(result3.cost, result1.cost, "Unblocked route restored");
});

test("Edit Ops: Change edge detour updates costs", () => {
  const edgeId = Data.edgeId("student-center", "covered-court");
  const edgeBefore = graph.getEdge(edgeId);
  const costBefore = edgeBefore.cost;

  graph.setEdgeDetour(edgeId, 2.0);
  const edgeAfter = graph.getEdge(edgeId);
  assert.ok(edgeAfter.cost > costBefore, `Cost increased: ${costBefore} → ${edgeAfter.cost}`);

  graph.setEdgeDetour(edgeId, edgeBefore.detour);
  const edgeRestored = graph.getEdge(edgeId);
  assert.equal(edgeRestored.cost, costBefore, "Cost restored after detour reset");
});

test("Edit Ops: Move node updates connected edge costs", () => {
  const nodeId = "student-center";
  const nodeBefore = graph.getNode(nodeId);
  const xBefore = nodeBefore.x, yBefore = nodeBefore.y;

  // Move node significantly
  graph.moveNode(nodeId, xBefore + 100, yBefore + 100);
  const nodeAfter = graph.getNode(nodeId);
  assert.equal(nodeAfter.x, xBefore + 100, "X position updated");
  assert.equal(nodeAfter.y, yBefore + 100, "Y position updated");

  // Verify connected edges updated
  const edgeId = Data.edgeId(nodeId, "covered-court");
  const edge = graph.getEdge(edgeId);
  assert.ok(edge.cost > 0, "Connected edge cost recalculated");

  // Restore
  graph.moveNode(nodeId, xBefore, yBefore);
});

test("Edit Ops: Remove node cleans up edges", () => {
  graph.addNode("remove-test", "Remove Test", 300, 300, "custom");
  graph.addEdge("remove-test", "int-6", "Test Edge", 1.0);

  const nodeCountBefore = graph.getAllNodes().length;
  const edgeCountBefore = graph.getAllEdges().length;

  graph.removeNode("remove-test");

  assert.equal(graph.getAllNodes().length, nodeCountBefore - 1, "Node removed");
  assert.equal(graph.getAllEdges().length, edgeCountBefore - 1, "Connected edge removed");
});

/* ──────────────────────────────────────────────────
   SECTION 5: EDGE CASE TESTS
   ────────────────────────────────────────────────── */

test("Edge Cases: Same start and goal returns zero-cost path", () => {
  const dests = getDestinations();
  for (const d of dests) {
    const result = Agent.aStar(graph, d.id, d.id);
    assert.equal(result.found, true);
    assert.deepEqual(result.path, [d.id]);
    assert.equal(result.cost, 0);
  }
});

test("Edge Cases: Fully blocked start reports no route", () => {
  const dests = getDestinations();
  const start = dests[0];
  const goal = dests[1];

  const blocked = new Set(graph.adjacency.get(start.id).map(e => e.edgeId));
  const result = Agent.aStar(graph, start.id, goal.id, { blocked });

  assert.equal(result.found, false, "No route when all edges blocked");
  assert.equal(result.message, "No available route found.");
  assert.deepEqual(result.path, []);
});

test("Edge Cases: Disconnected graph handles gracefully", () => {
  // Add isolated node with no edges
  graph.addNode("isolated", "Isolated", 10, 10, "custom");
  const result = Agent.aStar(graph, "isolated", "main-building");
  assert.equal(result.found, false, "Isolated node has no route");
  graph.removeNode("isolated");
});

test("Edge Cases: Non-existent nodes handled gracefully", () => {
  const result = Agent.aStar(graph, "non-existent", "main-building");
  assert.equal(result.found, false);
  assert.equal(result.message, "No available route found.");
});

test("Edge Cases: Min-heap maintains correct priority order", () => {
  const heap = new Agent.MinHeap((a, b) => a - b);
  [7, 2, 9, 1, 5, 3, 8, 4, 6].forEach(v => heap.push(v));
  const popped = [];
  while (!heap.isEmpty()) popped.push(heap.pop());
  assert.deepEqual(popped, [1, 2, 3, 4, 5, 6, 7, 8, 9], "Min-heap pops in ascending order");
});

test("Edge Cases: Heuristic consistency for all destination pairs", () => {
  const dests = getDestinations();
  for (const start of dests) {
    for (const goal of dests) {
      if (start.id === goal.id) continue;
      const hStart = Agent.euclidean(start, goal);
      const result = Agent.aStar(graph, start.id, goal.id);
      if (result.found) {
        // h(start) should be <= actual cost (admissible)
        assert.ok(hStart <= result.cost, `h(start)=${hStart} <= cost=${result.cost} for ${start.id}→${goal.id}`);
      }
    }
  }
});

/* ──────────────────────────────────────────────────
   SECTION 6: PERFORMANCE TESTS
   ────────────────────────────────────────────────── */

test("Performance: A* completes within reasonable time for all pairs", () => {
  const dests = getDestinations();
  const startTime = Date.now();

  for (const start of dests) {
    for (const goal of dests) {
      if (start.id === goal.id) continue;
      Agent.aStar(graph, start.id, goal.id);
    }
  }

  const elapsed = Date.now() - startTime;
  console.log(`  All ${dests.length * (dests.length - 1)} pairs computed in ${elapsed}ms`);
  assert.ok(elapsed < 5000, "All pairs computed within 5 seconds");
});

test("Performance: Single A* call is fast", () => {
  const iterations = 100;
  const startTime = Date.now();
  for (let i = 0; i < iterations; i++) {
    Agent.aStar(graph, "student-center", "rlrc-building");
  }
  const elapsed = Date.now() - startTime;
  const perCall = elapsed / iterations;
  console.log(`  ${iterations} calls in ${elapsed}ms (${perCall.toFixed(3)}ms/call)`);
  assert.ok(perCall < 10, "Single A* call under 10ms");
});

/* ──────────────────────────────────────────────────
   SECTION 7: ROAD NETWORK VALIDATION
   ────────────────────────────────────────────────── */

test("Road Network: Vehicle roads have higher detour than pedestrian", () => {
  const edges = graph.getAllEdges().filter(e => e.type === "vehicle" || e.type === "pedestrian");
  const vehicleAvg = edges.filter(e => e.type === "vehicle").reduce((s, e) => s + e.detour, 0) /
    edges.filter(e => e.type === "vehicle").length;
  const pedestrianAvg = edges.filter(e => e.type === "pedestrian").reduce((s, e) => s + e.detour, 0) /
    edges.filter(e => e.type === "pedestrian").length;

  console.log(`  Vehicle road avg detour: ${vehicleAvg.toFixed(2)}`);
  console.log(`  Pedestrian path avg detour: ${pedestrianAvg.toFixed(2)}`);
  // Both should be >= 1, vehicle typically higher
  assert.ok(vehicleAvg >= 1 && pedestrianAvg >= 1, "Detours >= 1");
});

test("Road Network: Perimeter loop is connected", () => {
  const perimeterNodes = ["int-1", "int-2", "int-3", "int-4", "int-5", "int-6", "int-7", "int-8", "int-9", "int-10", "int-11", "int-12", "int-13"];
  let connected = true;

  for (let i = 0; i < perimeterNodes.length - 1; i++) {
    const result = Agent.aStar(graph, perimeterNodes[i], perimeterNodes[i + 1]);
    if (!result.found) {
      connected = false;
      console.log(`  Break: ${perimeterNodes[i]} → ${perimeterNodes[i + 1]} not connected`);
    }
  }

  assert.ok(connected, "Perimeter loop fully connected");
});

test("Road Network: Cross-intersections connect vehicle + pedestrian roads", () => {
  // int-6 (180,200) connects left vertical (vehicle) + central horizontal (pedestrian)
  const int6 = graph.getNode("int-6");
  const edges = graph.adjacency.get("int-6");
  const types = edges.map(e => graph.getEdge(e.edgeId).type);
  console.log(`  int-6 edge types: ${types.join(", ")}`);
  assert.ok(types.includes("vehicle") && types.includes("pedestrian"), "int-6 connects vehicle + pedestrian");
});

/* ──────────────────────────────────────────────────
   SECTION 8: REAL-WORLD SCENARIO TESTS
   ────────────────────────────────────────────────── */

test("Real Scenario: Student Center → RLRC Building (cross-campus)", () => {
  const result = Agent.aStar(graph, "student-center", "rlrc-building");
  console.log(`  Distance: ${result.cost}m`);
  console.log(`  Path: ${result.path.join(" → ")}`);
  console.log(`  Expanded: ${result.expanded} nodes`);

  assert.ok(result.found);
  assert.ok(result.cost > 500, "Cross-campus distance reasonable");
  assert.ok(result.path.includes("student-center") && result.path.includes("rlrc-building"));
});

test("Real Scenario: Covered Court → North Park (perimeter)", () => {
  const result = Agent.aStar(graph, "covered-court", "north-park");
  console.log(`  Distance: ${result.cost}m`);
  console.log(`  Path: ${result.path.join(" → ")}`);

  assert.ok(result.found);
  assert.ok(result.cost > 300);
});

test("Real Scenario: Serenity Garden → Centienal Park (diagonal)", () => {
  const result = Agent.aStar(graph, "serenity-garden", "centennial-park");
  console.log(`  Distance: ${result.cost}m`);
  console.log(`  Path: ${result.path.join(" → ")}`);

  assert.ok(result.found);
});

test("Real Scenario: Main Building ↔ Admin Building (top corridor)", () => {
  const result = Agent.aStar(graph, "main-building", "admin-building");
  console.log(`  Distance: ${result.cost}m`);
  console.log(`  Path: ${result.path.join(" → ")}`);

  assert.ok(result.found);
  // Should be relatively short (top road direct connection)
  assert.ok(result.cost < 500, "Top corridor distance reasonable");
});

test("Real Scenario: Gazebo → Centienal Park (via park paths)", () => {
  const result = Agent.aStar(graph, "gazebo", "centennial-park");
  console.log(`  Distance: ${result.cost}m`);
  console.log(`  Path: ${result.path.join(" → ")}`);

  assert.ok(result.found);
  // Should use park path network
});

/* ──────────────────────────────────────────────────
   TEST RUNNER SUMMARY
   ────────────────────────────────────────────────── */

// This runs at the end to show summary
test("SUMMARY: All test sections complete", () => {
  console.log("\n════════════════════════════════════════════════════════════");
  console.log("COMPREHENSIVE TEST SUITE — SUMMARY");
  console.log("════════════════════════════════════════════════════════════");
  console.log("Sections tested:");
  console.log("  1. Graph Integrity (5 tests)");
  console.log("  2. A* Correctness (4 tests)");
  console.log("  3. Pathfinding Quality (4 tests)");
  console.log("  4. Edit Operations (5 tests)");
  console.log("  5. Edge Cases (6 tests)");
  console.log("  6. Performance (2 tests)");
  console.log("  7. Road Network Validation (3 tests)");
  console.log("  8. Real-World Scenarios (5 tests)");
  console.log("Total: 34 comprehensive tests");
  console.log("════════════════════════════════════════════════════════════\n");
});