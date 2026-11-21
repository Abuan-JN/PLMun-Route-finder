/*
 * A* search agent for the PLMUN Campus Route Finder.
 *
 * f(n) = g(n) + h(n)
 *   g(n): accumulated walking distance in metres
 *   h(n): straight-line Euclidean estimate to the goal (admissible)
 *
 * The same search routine powers a Dijkstra baseline (h = 0) so optimality
 * and node-expansion efficiency can be evaluated.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RouteAgent = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  class MinHeap {
    constructor(compare) {
      this.items = [];
      this.compare = compare;
    }

    get size() {
      return this.items.length;
    }

    isEmpty() {
      return this.items.length === 0;
    }

    push(item) {
      var items = this.items;
      items.push(item);
      var i = items.length - 1;
      while (i > 0) {
        var parent = (i - 1) >> 1;
        if (this.compare(items[i], items[parent]) >= 0) break;
        var tmp = items[i]; items[i] = items[parent]; items[parent] = tmp;
        i = parent;
      }
    }

    pop() {
      var items = this.items;
      if (items.length === 0) return null;
      var top = items[0];
      var last = items.pop();
      if (items.length > 0) {
        items[0] = last;
        var i = 0;
        for (;;) {
          var left = i * 2 + 1;
          var right = left + 1;
          var smallest = i;
          if (left < items.length && this.compare(items[left], items[smallest]) < 0) smallest = left;
          if (right < items.length && this.compare(items[right], items[smallest]) < 0) smallest = right;
          if (smallest === i) break;
          var tmp = items[i]; items[i] = items[smallest]; items[smallest] = tmp;
          i = smallest;
        }
      }
      return top;
    }
  }

  function asSet(value) {
    if (value instanceof Set) return value;
    return new Set(value || []);
  }

  function euclidean(a, b) {
    return Math.ceil(Math.hypot(a.x - b.x, a.y - b.y));
  }

  function search(graph, startId, goalId, options) {
    options = options || {};
    var blocked = asSet(options.blocked);
    var useHeuristic = options.useHeuristic !== false;
    var start = graph.nodeById.get(startId);
    var goal = graph.nodeById.get(goalId);

    if (!start || !goal) throw new Error("Start or goal node does not exist.");
    if (!graph.adjacency.has(startId) || !graph.adjacency.has(goalId)) throw new Error("Graph is missing adjacency data.");

    function heuristic(id) {
      if (!useHeuristic) return 0;
      return euclidean(graph.nodeById.get(id), goal);
    }

    var gScore = new Map([[startId, 0]]);
    var parent = new Map();
    var closed = new Set();
    var open = new MinHeap(function (a, b) {
      return a.f - b.f || a.h - b.h || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    });
    var trace = [];
    var expanded = 0;
    var peakFrontier = 0;

    open.push({ id: startId, g: 0, h: heuristic(startId), f: heuristic(startId) });

    while (!open.isEmpty()) {
      var current = open.pop();

      // Skip outdated heap entries left behind by cost improvements.
      if (current.g !== gScore.get(current.id)) continue;
      if (closed.has(current.id)) continue;

      closed.add(current.id);
      expanded++;
      peakFrontier = Math.max(peakFrontier, open.size + 1);
      trace.push({
        order: expanded,
        id: current.id,
        g: current.g,
        h: heuristic(current.id),
        f: current.g + heuristic(current.id)
      });

      if (current.id === goalId) {
        var path = [];
        var cursor = goalId;
        while (cursor !== undefined) {
          path.unshift(cursor);
          if (cursor === startId) break;
          cursor = parent.get(cursor);
        }
        return {
          found: true,
          path: path,
          cost: gScore.get(goalId),
          expanded: expanded,
          peakFrontier: peakFrontier,
          trace: trace,
          message: "Optimal route found."
        };
      }

      graph.adjacency.get(current.id).forEach(function (edge) {
        if (blocked.has(edge.edgeId) || closed.has(edge.to)) return;
        var tentativeG = gScore.get(current.id) + edge.cost;
        if (tentativeG < (gScore.has(edge.to) ? gScore.get(edge.to) : Infinity)) {
          parent.set(edge.to, current.id);
          gScore.set(edge.to, tentativeG);
          var h = heuristic(edge.to);
          open.push({ id: edge.to, g: tentativeG, h: h, f: tentativeG + h });
        }
      });
    }

    return {
      found: false,
      path: [],
      cost: Infinity,
      expanded: expanded,
      peakFrontier: peakFrontier,
      trace: trace,
      message: "No available route found."
    };
  }

  function aStar(graph, startId, goalId, options) {
    return search(graph, startId, goalId, Object.assign({}, options, { useHeuristic: true }));
  }

  function dijkstra(graph, startId, goalId, options) {
    return search(graph, startId, goalId, Object.assign({}, options, { useHeuristic: false }));
  }

  // Evaluation support: confirm h(n) never overestimates the true shortest cost.
  function heuristicAdmissibilityReport(graph) {
    var violations = [];
    var pairs = 0;
    graph.nodes.forEach(function (goal) {
      graph.nodes.forEach(function (node) {
        pairs++;
        var actual = dijkstra(graph, node.id, goal.id);
        var estimate = euclidean(node, goal);
        if (!actual.found || estimate > actual.cost) {
          violations.push({ from: node.id, to: goal.id, h: estimate, actual: actual.cost });
        }
      });
    });
    return { pairs: pairs, violations: violations, admissible: violations.length === 0 };
  }

  return {
    MinHeap: MinHeap,
    search: search,
    aStar: aStar,
    dijkstra: dijkstra,
    euclidean: euclidean,
    heuristicAdmissibilityReport: heuristicAdmissibilityReport
  };
});
