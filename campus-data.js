/*
 * Campus graph dataset for the PLMUN Campus Route Finder.
 *
 * Background: map-Copy.png (2046x1041, ~1.97:1 aspect ratio).
 * Canvas coordinates use a 1000 x 509 space exactly calibrated to the image.
 *
 * Road network:
 * - Vehicle perimeter roads (asphalt with white dashes)
 * - Pedestrian walkways (interior gray walkways across the campus courtyard)
 *
 * Destination nodes are located at the center of each building/facility:
 * A: Student Center
 * B: Covered Court
 * C: Main Building
 * D: Admin Building
 * E: RLRC Building
 * F: Gazebo
 * G: Centennial Park
 * H: Serenity Garden
 * I: North Park
 *
 * Edge cost = straight-line distance * detour factor (detour >= 1 keeps heuristic admissible).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CampusData = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var MAP = { width: 1000, height: 509 };

  /*
   * Physical road segments accurately aligned to map-Copy.png
   * Coordinates in 1000 x 509 viewBox.
   */
  var roadSegments = [
    // Outer perimeter vehicle loop (dark road with white dashes)
    { p1: [31, 153],  p2: [31, 483],  type: "vehicle", label: "West Gate Perimeter Road" },
    { p1: [31, 153],  p2: [361, 153], type: "vehicle", label: "West-East Entrance Road" },
    { p1: [361, 153], p2: [361, 18],  type: "vehicle", label: "Northwest Loop Connector" },
    { p1: [361, 18],  p2: [950, 18],  type: "vehicle", label: "North Boulevard Road" },
    { p1: [950, 18],  p2: [950, 153], type: "vehicle", label: "East Perimeter Road (Upper)" },
    { p1: [950, 153], p2: [950, 256], type: "vehicle", label: "East Perimeter Road (Mid)" },
    { p1: [950, 256], p2: [950, 395], type: "vehicle", label: "East Perimeter Road (Lower)" },
    { p1: [950, 395], p2: [342, 395], type: "vehicle", label: "South Loop Road" },
    { p1: [361, 153], p2: [353, 256], type: "vehicle", label: "Central Loop Avenue (Upper)" },
    { p1: [353, 256], p2: [342, 395], type: "vehicle", label: "Central Loop Avenue (Lower)" },
    { p1: [342, 395], p2: [332, 508], type: "vehicle", label: "South Gate Access Road" },

    // Interior pedestrian walkways (gray corridors on the map)
    { p1: [361, 153], p2: [703, 153], type: "pedestrian", label: "North Walkway (West)" },
    { p1: [703, 153], p2: [950, 153], type: "pedestrian", label: "North Walkway (East)" },
    { p1: [353, 256], p2: [703, 256], type: "pedestrian", label: "Central Plaza Walkway (West)" },
    { p1: [703, 256], p2: [950, 256], type: "pedestrian", label: "Central Plaza Walkway (East)" },
    { p1: [703, 153], p2: [703, 256], type: "pedestrian", label: "Central Courtyard Crosswalk" }
  ];

  /*
   * Destination nodes placed right on the real image centroids:
   */
  var destinations = [
    { id: "student-center",  name: "Student Center (A)",      type: "building", x: 167, y: 102, mapLabel: "Student Center (A)" },
    { id: "covered-court",   name: "Covered Court (B)",       type: "building", x: 181, y: 206, mapLabel: "Covered Court (B)" },
    { id: "main-building",   name: "Main Building (C)",       type: "building", x: 526, y: 86,  mapLabel: "Main Building (C)" },
    { id: "admin-building",  name: "Admin Building (D)",      type: "building", x: 812, y: 86,  mapLabel: "Admin Building (D)" },
    { id: "rlrc-building",   name: "RLRC Building (E)",       type: "building", x: 704, y: 324, mapLabel: "RLRC Building (E)" },
    { id: "gazebo",          name: "Gazebo (F)",              type: "facility", x: 374, y: 328, mapLabel: "Gazebo (F)" },
    { id: "centennial-park", name: "Centennial Park (G)",     type: "park",     x: 510, y: 461, mapLabel: "Centennial Park (G)" },
    { id: "serenity-garden", name: "Serenity Garden (H)",     type: "park",     x: 216, y: 298, mapLabel: "Serenity Garden (H)" },
    { id: "north-park",      name: "North Park (I)",          type: "park",     x: 876, y: 196, mapLabel: "North Park (I)" }
  ];

  function dist(p1, p2) {
    return Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  }

  function nearestPointOnSegments(point, segments) {
    var best = null;
    var bestDist = Infinity;
    var bestSegment = null;
    segments.forEach(function (s) {
      var x1 = s.p1[0], y1 = s.p1[1];
      var x2 = s.p2[0], y2 = s.p2[1];
      var dx = x2 - x1, dy = y2 - y1;
      var len2 = dx * dx + dy * dy;
      var t = ((point[0] - x1) * dx + (point[1] - y1) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      var proj = [Math.round(x1 + t * dx), Math.round(y1 + t * dy)];
      var d = dist(point, proj);
      if (d < bestDist) {
        bestDist = d;
        best = proj;
        bestSegment = s;
      }
    });
    return { point: best, segment: bestSegment };
  }

  // Intersections of road network
  var intersectionCoords = [];
  var intersectionIds = [];

  function addIntersection(pt) {
    for (var i = 0; i < intersectionCoords.length; i++) {
      if (Math.hypot(intersectionCoords[i][0] - pt[0], intersectionCoords[i][1] - pt[1]) < 3) {
        return intersectionIds[i];
      }
    }
    var id = "int-" + (intersectionCoords.length + 1);
    intersectionCoords.push(pt);
    intersectionIds.push(id);
    return id;
  }

  // Register road segment endpoints as intersections
  roadSegments.forEach(function (seg) {
    seg.aId = addIntersection(seg.p1);
    seg.bId = addIntersection(seg.p2);
  });

  // Base node list
  var allNodes = [];
  destinations.forEach(function (d) { allNodes.push(d); });
  intersectionCoords.forEach(function (c, i) {
    allNodes.push({ id: intersectionIds[i], name: "Junction " + (i + 1), type: "intersection", x: c[0], y: c[1] });
  });

  function edgeId(a, b) {
    return a < b ? a + "|" + b : b + "|" + a;
  }

  // Build raw edges for roads
  var rawEdges = [];
  roadSegments.forEach(function (seg) {
    rawEdges.push({
      a: seg.aId,
      b: seg.bId,
      label: seg.label,
      detour: 1.02,
      type: seg.type
    });
  });

  // Connect each destination node cleanly to the closest road/walkway network point
  destinations.forEach(function (dest) {
    var nearest = nearestPointOnSegments([dest.x, dest.y], roadSegments);
    if (!nearest.point) return;

    var connId = "conn-" + dest.id;
    allNodes.push({ id: connId, name: dest.name + " Gateway", type: "connector", x: nearest.point[0], y: nearest.point[1] });

    // Link connector to destination
    rawEdges.push({
      a: dest.id,
      b: connId,
      label: "Access to " + dest.name,
      detour: 1.01,
      type: "connector"
    });

    // Link connector into nearest road segment endpoints
    var seg = nearest.segment;
    if (seg) {
      rawEdges.push({
        a: connId,
        b: seg.aId,
        label: seg.label + " Link",
        detour: 1.02,
        type: seg.type
      });
      rawEdges.push({
        a: connId,
        b: seg.bId,
        label: seg.label + " Link",
        detour: 1.02,
        type: seg.type
      });
    }
  });

  var nodeById = new Map(allNodes.map(function (n) { return [n.id, n]; }));

  function rebuildEdges() {
    var edges = rawEdges.map(function (e) {
      var from = nodeById.get(e.a);
      var to = nodeById.get(e.b);
      if (!from || !to) throw new Error("Unknown node in edge: " + e.a + " / " + e.b);
      var straight = Math.hypot(to.x - from.x, to.y - from.y);
      var d = Math.max(1, Number(e.detour) || 1);
      return {
        id: edgeId(e.a, e.b),
        a: e.a,
        b: e.b,
        label: e.label,
        detour: d,
        straightDistance: Math.ceil(straight),
        cost: Math.ceil(straight * d),
        type: e.type,
        obstacleId: null
      };
    });

    // Remove duplicates
    var uniqueMap = new Map();
    edges.forEach(function (edge) {
      if (!uniqueMap.has(edge.id)) {
        uniqueMap.set(edge.id, edge);
      }
    });
    edges = Array.from(uniqueMap.values());

    var edgeById = new Map(edges.map(function (edge) { return [edge.id, edge]; }));
    var adjacency = new Map(allNodes.map(function (n) { return [n.id, []]; }));
    edges.forEach(function (edge) {
      adjacency.get(edge.a).push({ to: edge.b, cost: edge.cost, edgeId: edge.id, label: edge.label });
      adjacency.get(edge.b).push({ to: edge.a, cost: edge.cost, edgeId: edge.id, label: edge.label });
    });

    return { edges: edges, edgeById: edgeById, adjacency: adjacency };
  }

  var graphEdges = rebuildEdges();
  var edges = graphEdges.edges;
  var edgeById = graphEdges.edgeById;
  var adjacency = graphEdges.adjacency;

  // Obstacle management
  var obstacles = [
    { id: "central-crosswalk", label: "Central Courtyard Crosswalk Maintenance", edgeId: edgeId(roadSegments[15].aId, roadSegments[15].bId) }
  ];

  // Obstacle options on alternate paths
  [0, 3, 7, 11, 13].forEach(function (idx) {
    if (roadSegments[idx]) {
      var idVal = edgeId(roadSegments[idx].aId, roadSegments[idx].bId);
      if (!obstacles.some(function (o) { return o.edgeId === idVal; })) {
        obstacles.push({ id: "obs-" + idx, label: "Under Construction: " + roadSegments[idx].label, edgeId: idVal });
      }
    }
  });

  function recalcCosts() {
    graphEdges = rebuildEdges();
    edges = graphEdges.edges;
    edgeById = graphEdges.edgeById;
    adjacency = graphEdges.adjacency;
  }

  function addNode(id, name, x, y, type) {
    if (nodeById.has(id)) throw new Error("Node already exists: " + id);
    var node = { id: id, name: name, type: type || "custom", x: x, y: y };
    allNodes.push(node);
    nodeById.set(id, node);
    adjacency.set(id, []);
    recalcCosts();
    return node;
  }

  function removeNode(id) {
    var node = nodeById.get(id);
    if (!node) return false;
    rawEdges = rawEdges.filter(function (e) { return e.a !== id && e.b !== id; });
    allNodes = allNodes.filter(function (n) { return n.id !== id; });
    nodeById.delete(id);
    recalcCosts();
    return true;
  }

  function addEdge(a, b, label, detour) {
    if (!nodeById.has(a) || !nodeById.has(b)) throw new Error("Unknown node: " + a + " / " + b);
    var id = edgeId(a, b);
    if (edgeById.has(id)) throw new Error("Pathway already exists between " + a + " and " + b);
    var d = Math.max(1, Number(detour) || 1);
    rawEdges.push({ a: a, b: b, label: label || ("Path " + a + "-" + b), detour: d, type: "custom" });
    recalcCosts();
    return edgeById.get(id);
  }

  function removeEdge(edgeIdValue) {
    rawEdges = rawEdges.filter(function (e) { return edgeId(e.a, e.b) !== edgeIdValue; });
    recalcCosts();
    return true;
  }

  function setEdgeDetour(edgeIdValue, detour) {
    var edge = edgeById.get(edgeIdValue);
    if (!edge) return false;
    var d = Math.max(1, Number(detour) || 1);
    edge.detour = d;
    var raw = rawEdges.find(function (e) { return edgeId(e.a, e.b) === edgeIdValue; });
    if (raw) raw.detour = d;
    recalcCosts();
    return true;
  }

  function setEdgeBlocked(edgeIdValue, blocked) {
    var edge = edgeById.get(edgeIdValue);
    if (!edge) return false;
    if (blocked) {
      if (!obstacles.some(function (o) { return o.edgeId === edgeIdValue; })) {
        obstacles.push({ id: "blocked-" + edgeIdValue.replace(/\|/g, "-"), label: "Blocked: " + edge.label, edgeId: edgeIdValue });
      }
    } else {
      obstacles = obstacles.filter(function (o) { return o.edgeId !== edgeIdValue; });
    }
    return true;
  }

  function moveNode(nodeId, x, y) {
    var node = nodeById.get(nodeId);
    if (!node) return false;
    node.x = Math.max(0, Math.min(MAP.width, x));
    node.y = Math.max(0, Math.min(MAP.height, y));
    recalcCosts();
    return true;
  }

  function getEdge(edgeIdValue) { return edgeById.get(edgeIdValue); }
  function getNode(nodeId) { return nodeById.get(nodeId); }
  function getAllNodes() { return allNodes.slice(); }
  function getAllEdges() { return edges.slice(); }

  function createGraph() {
    return {
      get nodes() { return allNodes; },
      get nodeById() { return nodeById; },
      get edges() { return edges; },
      get edgeById() { return edgeById; },
      get adjacency() { return adjacency; },
      get map() { return MAP; },
      get roadSegments() { return roadSegments; },
      get destinations() { return destinations; },
      edgeId: edgeId,
      addNode: addNode,
      removeNode: removeNode,
      addEdge: addEdge,
      removeEdge: removeEdge,
      setEdgeDetour: setEdgeDetour,
      setEdgeBlocked: setEdgeBlocked,
      moveNode: moveNode,
      getEdge: getEdge,
      getNode: getNode,
      getAllNodes: getAllNodes,
      getAllEdges: getAllEdges
    };
  }

  return {
    MAP: MAP,
    nodes: allNodes,
    edges: edges,
    edgeById: edgeById,
    nodeById: nodeById,
    adjacency: adjacency,
    roadSegments: roadSegments,
    destinations: destinations,
    obstacles: obstacles,
    edgeId: edgeId,
    createGraph: createGraph,
    addNode: addNode,
    removeNode: removeNode,
    addEdge: addEdge,
    removeEdge: removeEdge,
    setEdgeDetour: setEdgeDetour,
    setEdgeBlocked: setEdgeBlocked,
    moveNode: moveNode,
    getEdge: getEdge,
    getNode: getNode,
    getAllNodes: getAllNodes,
    getAllEdges: getAllEdges,
    recalcCosts: recalcCosts
  };
});
