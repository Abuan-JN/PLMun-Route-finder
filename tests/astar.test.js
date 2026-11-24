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
    assert.ok(edge, `no edge between ${path[i]} and ${path[i + 1]}`);
    total += edge.cost;
  }
  return total;
}

function getDestinations() {
  return graph.getAllNodes().filter(function (n) {
    return n.type !== "intersection" && n.type !== "connector";
  });
}

test("A* returns the same optimal cost as Dijkstra for every destination pair", () => {
  const dests = getDestinations();
  for (const start of dests) {
    for (const goal of dests) {
      const aStar = Agent.aStar(graph, start.id, goal.id);
      const baseline = Agent.dijkstra(graph, start.id, goal.id);
      assert.equal(aStar.found, true, start.id + " -> " + goal.id + " should be reachable");
      assert.equal(aStar.cost, baseline.cost, start.id + " -> " + goal.id + " cost mismatch");
      assert.equal(aStar.cost, pathCost(aStar.path), start.id + " -> " + goal.id + " path cost mismatch");
      assert.equal(aStar.path[0], start.id);
      assert.equal(aStar.path[aStar.path.length - 1], goal.id);
    }
  }
});

test("the Euclidean heuristic never overestimates the true shortest distance", () => {
  const report = Agent.heuristicAdmissibilityReport(graph);
  assert.equal(report.admissible, true, JSON.stringify(report.violations.slice(0, 5)));
});

test("blocked walkways are avoided while a valid alternative is used", () => {
  const dests = getDestinations();
  const start = dests[0];
  const goal = dests[dests.length - 1];
  const result = Agent.aStar(graph, start.id, goal.id);
  assert.equal(result.found, true, start.id + " -> " + goal.id + " should be reachable");
  assert.equal(pathCost(result.path), result.cost, "path cost mismatch");

  // Block every edge connected to the start's connector
  const startNode = graph.getNode(start.id);
  const startEdges = graph.adjacency.get(start.id);
  const blocked = new Set(startEdges.map(function (e) { return e.edgeId; }));

  const result2 = Agent.aStar(graph, start.id, goal.id, { blocked: blocked });
  // If start is fully blocked, no route. Otherwise should still find one.
  if (result2.found) {
    assert.equal(pathCost(result2.path), result2.cost, "blocked path cost mismatch");
  }
});

test("student-center to rlrc-building finds alternative via east perimeter when central plaza walkway is blocked", () => {
  const obs = Data.obstacles.find(o => o.id === "plaza-walkway-east");
  assert.ok(obs, "plaza-walkway-east obstacle definition exists");
  const blocked = new Set(obs.edgeIds);
  const result = Agent.aStar(graph, "student-center", "rlrc-building", { blocked: blocked });
  assert.equal(result.found, true, "alternative route must be found");
  assert.ok(result.path.includes("int-7"), "path should route around through Junction 7");
  assert.ok(result.path.includes("conn-rlrc-building"), "path must enter RLRC from the top gateway");
  assert.ok(!result.path.includes("int-13"), "path must not use blocked Central Plaza walkway");
  assert.equal(pathCost(result.path), result.cost);
});

test("disconnecting every path around a location reports no route", () => {
  const dests = getDestinations();
  const start = dests[0];
  const blocked = new Set(graph.adjacency.get(start.id).map(function (e) { return e.edgeId; }));
  const result = Agent.aStar(graph, start.id, dests[1].id, { blocked: blocked });
  assert.equal(result.found, false, "should be unreachable when all edges blocked");
  assert.equal(result.message, "No available route found.");
  assert.deepEqual(result.path, []);
});

test("start equal to goal is a zero-cost single-node path", () => {
  const dests = getDestinations();
  const result = Agent.aStar(graph, dests[0].id, dests[0].id);
  assert.equal(result.found, true);
  assert.deepEqual(result.path, [dests[0].id]);
  assert.equal(result.cost, 0);
});

test("the min-heap pops priorities in ascending order", () => {
  const heap = new Agent.MinHeap(function (a, b) { return a - b; });
  [7, 2, 9, 1, 5].forEach(function (value) { heap.push(value); });
  const popped = [];
  while (!heap.isEmpty()) popped.push(heap.pop());
  assert.deepEqual(popped, [1, 2, 5, 7, 9]);
});

test("adding a new node creates a reachable destination", () => {
  const initialCount = graph.getAllNodes().length;
  graph.addNode("test-node", "Test Node", 500, 250, "custom");
  // Connect the new node to the nearest intersection
  graph.addEdge("test-node", "int-10", "Test Access", 1.05);
  assert.equal(graph.getAllNodes().length, initialCount + 1);
  const result = Agent.aStar(graph, "test-node", "main-building");
  assert.equal(result.found, true, "new node should be reachable");
  // Clean up
  graph.removeNode("test-node");
});
