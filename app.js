/* UI controller for the PLMUN Campus Route Finder. */
(function () {
  "use strict";

  var Data = window.CampusData;
  var Agent = window.RouteAgent;
  var graph = Data.createGraph();
  var MAP = Data.MAP;
  var byId = graph.nodeById;
  var svgNS = "http://www.w3.org/2000/svg";

  var els = {
    start: document.getElementById("start-select"),
    goal: document.getElementById("goal-select"),
    swap: document.getElementById("swap-button"),
    find: document.getElementById("find-button"),
    clear: document.getElementById("clear-button"),
    editToggle: document.getElementById("edit-toggle"),
    edgeLayer: document.getElementById("edge-layer"),
    routeLayer: document.getElementById("route-layer"),
    nodeLayer: document.getElementById("node-layer"),
    obstacles: document.getElementById("obstacle-list"),
    mapHint: document.getElementById("map-hint"),
    results: document.getElementById("results"),
    status: document.getElementById("status-badge"),
    segments: Array.prototype.slice.call(document.querySelectorAll(".segment")),
    themeToggle: document.getElementById("theme-toggle"),
    themeIcon: document.getElementById("theme-icon"),
    editor: document.getElementById("editor-panel"),
    editorBody: document.getElementById("editor-body"),
    addNodeBtn: document.getElementById("add-node-btn"),
    addNodeName: document.getElementById("add-node-name"),
    addNodeType: document.getElementById("add-node-type"),
    addEdgeBtn: document.getElementById("add-edge-btn"),
    addEdgeDetour: document.getElementById("add-edge-detour"),
    mapShell: document.querySelector(".map-shell"),
  };

  var mapMode = "start";
  var editMode = false;
  var addingNode = false;
  var dragging = { active: false, id: null };

  function svg(tag, attrs) {
    var el = document.createElementNS(svgNS, tag);
    Object.keys(attrs || {}).forEach(function (key) { el.setAttribute(key, attrs[key]); });
    return el;
  }

  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function fmt(number) {
    return Math.round(number).toLocaleString("en-US");
  }

  function icon(id, extraClass) {
    return '<svg aria-hidden="true"' + (extraClass ? ' class="' + extraClass + '"' : "") + '><use href="#' + id + '"></use></svg>';
  }

  /* ---------- Theme ---------- */

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    var dark = theme === "dark";
    els.themeToggle.setAttribute("aria-pressed", String(dark));
    els.themeToggle.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
    els.themeIcon.setAttribute("href", dark ? "#icon-sun" : "#icon-moon");
  }

  function savedTheme() {
    try { return window.localStorage.getItem("plmun-route-theme"); } catch (err) { return null; }
  }

  function storeTheme(theme) {
    try { window.localStorage.setItem("plmun-route-theme", theme); } catch (err) { /* storage unavailable */ }
  }

  /* ---------- Setup ---------- */

  function populateSelects() {
    [els.start, els.goal].forEach(function (select) {
      select.innerHTML = "";
      var fragment = document.createDocumentFragment();
      fragment.appendChild(new Option("Select a location…", ""));
      graph.getAllNodes().forEach(function (node) {
        fragment.appendChild(new Option(node.name + " (" + node.type + ")", node.id));
      });
      select.appendChild(fragment);
    });
    els.start.value = "main-building";
    els.goal.value = "rlrc-building";
  }

  function buildMap() {
    // Background image
    var existingBg = els.mapShell.querySelector(".map-background");
    if (!existingBg) {
      var bgImg = document.createElement("img");
      bgImg.src = "map-Copy.png";
      bgImg.className = "map-background";
      els.mapShell.prepend(bgImg);
    }

    els.edgeLayer.innerHTML = "";

    // Road segments: vehicle roads (dark asphalt) and walkways (gray)
    Data.roadSegments.forEach(function (road) {
      var isVehicle = road.type === "vehicle";
      var color = isVehicle ? "#33373b" : "#cbd5e1";
      var width = isVehicle ? "18" : "10";
      
      var line = svg("line", {
        x1: road.p1[0], y1: road.p1[1], x2: road.p2[0], y2: road.p2[1],
        "class": "road road-" + road.type,
        "stroke": color,
        "stroke-width": width,
        "stroke-linecap": "round",
        "opacity": isVehicle ? "0.25" : "0.45",
        "pointer-events": "none",
      });
      els.edgeLayer.appendChild(line);

      // Add center dashed white strip for vehicle roads
      if (isVehicle) {
        els.edgeLayer.appendChild(svg("line", {
          x1: road.p1[0], y1: road.p1[1], x2: road.p2[0], y2: road.p2[1],
          "stroke": "#ffffff",
          "stroke-width": "1.8",
          "stroke-linecap": "round",
          "stroke-dasharray": "6 6",
          "opacity": "0.4",
          "pointer-events": "none",
        }));
      }
    });

    // Pathway edges (thin lines between graph nodes)
    graph.getAllEdges().forEach(function (edge) {
      var a = byId.get(edge.a);
      var b = byId.get(edge.b);
      if (!a || !b) return;
      els.edgeLayer.appendChild(svg("line", {
        x1: a.x, y1: a.y, x2: b.x, y2: b.y,
        "data-edge-id": edge.id,
        "class": "edge",
      }));
    });

    // Nodes
    graph.getAllNodes().forEach(function (node) {
      var isDest = node.type !== "intersection" && node.type !== "connector";
      var button = document.createElement("button");
      button.type = "button";
      button.className = "map-node" + (editMode ? " is-draggable" : "") + (isDest ? " is-destination" : "");
      button.dataset.id = node.id;
      button.style.left = (node.x / MAP.width * 100) + "%";
      button.style.top = (node.y / MAP.height * 100) + "%";
      button.setAttribute("aria-label", node.name);
      button.title = node.name;

      var label = document.createElement("span");
      label.className = "node-label";
      label.textContent = node.mapLabel || node.name;

      var dot = document.createElement("span");
      dot.className = "node-dot";
      dot.setAttribute("aria-hidden", "true");

      if (editMode) {
        var handle = document.createElement("span");
        handle.className = "drag-handle";
        handle.setAttribute("aria-hidden", "true");
        handle.textContent = "\u2605";
        button.appendChild(handle);
      }

      button.appendChild(label);
      button.appendChild(dot);
      els.nodeLayer.appendChild(button);
    });
    bindNodeDrag();
  }

  function buildObstacles() {
    els.obstacles.innerHTML = "";
    Data.obstacles.forEach(function (obstacle) {
      var label = document.createElement("label");
      label.className = "obstacle-option";
      var checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = obstacle.id;
      checkbox.id = "obstacle-" + obstacle.id;
      var text = document.createElement("span");
      text.textContent = obstacle.label;
      label.appendChild(checkbox);
      label.appendChild(text);
      els.obstacles.appendChild(label);
    });
  }

  function setMode(mode) {
    mapMode = mode;
    els.segments.forEach(function (button) {
      button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
    });
    els.mapHint.textContent = mode === "start"
      ? "Tip: click a location on the map to set the start."
      : "Tip: click a location on the map to set the destination.";
    els.nodeLayer.querySelectorAll(".map-node").forEach(function (button) {
      var name = byId.get(button.dataset.id).name;
      button.setAttribute("aria-label", "Set " + (mode === "start" ? "start" : "destination") + " at " + name);
    });
  }

  function toggleEditMode() {
    editMode = !editMode;
    els.editToggle.setAttribute("aria-pressed", String(editMode));
    els.editToggle.classList.toggle("is-active", editMode);
    els.editor.style.display = editMode ? "block" : "none";
    els.mapHint.textContent = editMode
      ? "Edit mode: drag nodes, click map to add node, or use panels below."
      : (mapMode === "start" ? "Tip: click a location on the map to set the start." : "Tip: click a location on the map to set the destination.");
    els.nodeLayer.innerHTML = "";
    buildMap();
    renderEditor();
    syncBlockedEdges(blockedEdges());
    run();
  }

  function blockedEdges() {
    var chosen = new Set();
    els.obstacles.querySelectorAll("input:checked").forEach(function (input) { chosen.add(input.value); });
    return new Set(Data.obstacles.filter(function (item) { return chosen.has(item.id); })
      .map(function (item) { return item.edgeId; }));
  }

  function syncBlockedEdges(blocked) {
    els.edgeLayer.querySelectorAll(".edge").forEach(function (line) {
      line.classList.toggle("is-blocked", blocked.has(line.dataset.edgeId));
    });
  }

  /* ---------- Drag & drop ---------- */

  function bindNodeDrag() {
    els.nodeLayer.querySelectorAll(".map-node").forEach(function (button) {
      button.addEventListener("pointerdown", onPointerDown, { passive: false });
    });
  }

  function onPointerDown(event) {
    if (!editMode) return;
    event.preventDefault();
    var button = event.currentTarget;
    var id = button.dataset.id;

    dragging.active = true;
    dragging.id = id;

    button.setPointerCapture(event.pointerId);
    button.classList.add("is-dragging");

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  }

  function onPointerMove(event) {
    if (!dragging.active) return;
    event.preventDefault();

    var mapShell = document.querySelector(".map-shell");
    var mRect = mapShell.getBoundingClientRect();

    var x = ((event.clientX - mRect.left) / mRect.width) * MAP.width;
    var y = ((event.clientY - mRect.top) / mRect.height) * MAP.height;

    graph.moveNode(dragging.id, x, y);
    var node = byId.get(dragging.id);
    var button = els.nodeLayer.querySelector('.map-node[data-id="' + dragging.id + '"]');
    if (button) {
      button.style.left = (node.x / MAP.width * 100) + "%";
      button.style.top = (node.y / MAP.height * 100) + "%";
    }

    els.edgeLayer.querySelectorAll('.edge[data-edge-id]').forEach(function (line) {
      var edge = graph.getEdge(line.dataset.edgeId);
      if (!edge || (edge.a !== dragging.id && edge.b !== dragging.id)) return;
      var a = byId.get(edge.a);
      var b = byId.get(edge.b);
      line.setAttribute("x1", a.x);
      line.setAttribute("y1", a.y);
      line.setAttribute("x2", b.x);
      line.setAttribute("y2", b.y);
    });
  }

  function onPointerUp() {
    if (!dragging.active) return;
    dragging.active = false;
    var button = els.nodeLayer.querySelector('.map-node[data-id="' + dragging.id + '"]');
    if (button) button.classList.remove("is-dragging");
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
    dragging.id = null;
    run();
  }

  /* ---------- Click to add node ---------- */

  function enableAddNodeMode() {
    addingNode = !addingNode;
    els.addNodeBtn.classList.toggle("is-active", addingNode);
    els.mapHint.textContent = addingNode
      ? "Click anywhere on the map to add a new node."
      : (mapMode === "start" ? "Tip: click a location on the map to set the start." : "Tip: click a location on the map to set the destination.");
  }

  function addNodeAt(x, y) {
    var name = els.addNodeName.value.trim() || "New Node";
    var type = els.addNodeType.value || "custom";
    var id = "custom-" + Date.now();
    try {
      graph.addNode(id, name, x, y, type);
      els.addNodeName.value = "";
      els.nodeLayer.innerHTML = "";
      buildMap();
      populateSelects();
      renderEditor();
      syncBlockedEdges(blockedEdges());
      run();
      els.mapHint.textContent = "Node \"" + name + "\" added at (" + Math.round(x) + ", " + Math.round(y) + ").";
    } catch (err) {
      alert(err.message);
    }
  }

  /* ---------- Directions ---------- */

  function bearing(from, to) {
    var degrees = Math.atan2(to.x - from.x, -(to.y - from.y)) * 180 / Math.PI;
    return (degrees + 360) % 360;
  }

  function compass(angle) {
    var names = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
    return names[Math.round(angle / 45) % 8];
  }

  function turnBetween(previous, current, next) {
    var incoming = bearing(previous, current);
    var outgoing = bearing(current, next);
    var delta = ((outgoing - incoming + 540) % 360) - 180;
    if (Math.abs(delta) < 22) return "Continue straight";
    if (Math.abs(delta) > 157) return "Make a U-turn";
    return delta > 0 ? "Turn right" : "Turn left";
  }

  function buildDirections(path) {
    var steps = [{ text: "Start at " + byId.get(path[0]).name }];
    for (var i = 0; i < path.length - 1; i++) {
      var from = byId.get(path[i]);
      var to = byId.get(path[i + 1]);
      var edge = graph.getEdge(Data.edgeId(path[i], path[i + 1]));
      var turn = i === 0 ? "" : turnBetween(byId.get(path[i - 1]), from, to) + " — ";
      steps.push({
        text: turn + "Head " + compass(bearing(from, to)) + " along " + edge.label + " to " + to.name,
        distance: edge.cost
      });
    }
    steps.push({ text: "Arrive at " + byId.get(path[path.length - 1]).name });
    return steps;
  }

  /* ---------- Rendering ---------- */

  function setStatus(text, type) {
    els.status.textContent = text;
    els.status.className = "status-badge status-" + type;
  }

  function emptyState(title, message, iconName) {
    return '<div class="empty-state">' +
      '<span class="empty-icon">' + icon(iconName) + '</span>' +
      "<h3>" + esc(title) + "</h3><p>" + esc(message) + "</p></div>";
  }

  function clearRouteVisuals() {
    els.routeLayer.replaceChildren();
    els.nodeLayer.querySelectorAll(".map-node").forEach(function (button) {
      button.classList.remove("is-start", "is-goal", "on-route");
    });
  }

  function markNodes(path, startId, goalId) {
    path.forEach(function (id) {
      var button = els.nodeLayer.querySelector('.map-node[data-id="' + id + '"]');
      if (button) button.classList.add("on-route");
    });
    var startButton = els.nodeLayer.querySelector('.map-node[data-id="' + startId + '"]');
    var goalButton = els.nodeLayer.querySelector('.map-node[data-id="' + goalId + '"]');
    if (startButton) startButton.classList.add("is-start");
    if (goalButton) goalButton.classList.add("is-goal");
  }

  function drawRoute(path) {
    var prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (var i = 0; i < path.length - 1; i++) {
      var a = byId.get(path[i]);
      var b = byId.get(path[i + 1]);
      var length = Math.hypot(b.x - a.x, b.y - a.y);
      var line = svg("line", {
        x1: a.x, y1: a.y, x2: b.x, y2: b.y,
        "class": "route-line"
      });
      if (!prefersReduced) {
        line.style.strokeDasharray = String(length);
        line.style.strokeDashoffset = String(length);
        line.style.transitionDelay = (i * 70) + "ms";
      }
      els.routeLayer.appendChild(line);
      if (!prefersReduced) {
        (function (element) {
          window.requestAnimationFrame(function () {
            window.requestAnimationFrame(function () { element.style.strokeDashoffset = "0"; });
          });
        })(line);
      }
    }
  }

  function resultHTML(result, baseline, startId, goalId) {
    var path = result.path;
    var steps = buildDirections(path);
    var chain = path.map(function (id) {
      return '<li class="chain-node">' + esc(byId.get(id).name) + "</li>";
    }).join("");
    var optimal = baseline.found && baseline.cost === result.cost;
    var saved = baseline.expanded - result.expanded;
    var efficiency = saved > 0
      ? "A* expanded <strong>" + saved + "</strong> fewer nodes than Dijkstra (" + result.expanded + " vs " + baseline.expanded + ")."
      : saved < 0
        ? "Dijkstra expanded fewer nodes for this pair (" + baseline.expanded + " vs " + result.expanded + ")."
        : "Both algorithms expanded " + result.expanded + " nodes for this pair.";

    var traceRows = result.trace.slice(0, 12).map(function (entry) {
      return "<tr><td>" + entry.order + "</td><td>" + esc(byId.get(entry.id).name) +
        "</td><td>" + fmt(entry.g) + "</td><td>" + fmt(entry.h) + "</td><td>" + fmt(entry.f) + "</td></tr>";
    }).join("");
    if (result.trace.length > 12) {
      traceRows += '<tr class="trace-more"><td colspan="5">+' + (result.trace.length - 12) + " more nodes expanded</td></tr>";
    }

    var stepRows = steps.map(function (step, index) {
      return '<li><span class="step-num">' + (index + 1) + '</span>' +
        '<span class="step-text">' + esc(step.text) + "</span>" +
        (step.distance != null ? '<span class="step-distance">' + fmt(step.distance) + " m</span>" : "") +
        "</li>";
    }).join("");

    return '' +
      '<div class="verification ' + (optimal ? "is-valid" : "is-invalid") + '">' +
        icon(optimal ? "icon-check" : "icon-alert") +
        "<span>" + (optimal
          ? "Verified optimal — matches the minimum cost found by Dijkstra. " + efficiency
          : "Cost differs from the Dijkstra baseline. " + efficiency) +
        "</span></div>" +
      '<div class="summary-grid">' +
        '<div class="metric"><span class="metric-value">' + fmt(result.cost) + ' <small>m</small></span><span class="metric-label">Total walking distance</span></div>' +
        '<div class="metric"><span class="metric-value">' + path.length + '</span><span class="metric-label">Locations on path</span></div>' +
        '<div class="metric"><span class="metric-value">' + (path.length - 1) + '</span><span class="metric-label">Walking legs</span></div>' +
        '<div class="metric"><span class="metric-value">' + result.expanded + '</span><span class="metric-label">Nodes expanded</span></div>' +
      "</div>" +
      '<div class="result-grid">' +
        '<div class="result-block"><h3>Optimal node sequence <span>' + esc(byId.get(startId).name) + " → " + esc(byId.get(goalId).name) + "</span></h3>" +
        '<ol class="route-chain">' + chain + "</ol></div>" +
        '<div class="result-block"><h3>Turn-by-turn directions</h3><ol class="steps">' + stepRows + "</ol></div>" +
      "</div>" +
      '<div class="result-block trace-block"><h3>A* expansion trace <span>lowest f(n) first</span></h3>' +
        '<div class="trace-wrap"><table class="trace"><caption class="sr-only">Nodes expanded by the A* agent, in order</caption>' +
        "<thead><tr><th scope=\"col\">#</th><th scope=\"col\">Node</th><th scope=\"col\">g(n)</th><th scope=\"col\">h(n)</th><th scope=\"col\">f(n)</th></tr></thead>" +
        "<tbody>" + traceRows + "</tbody></table></div></div>";
  }

  /* ---------- Pathway editor ---------- */

  function renderEditor() {
    var container = els.editorBody;
    container.innerHTML = "";

    var intro = document.createElement("p");
    intro.className = "editor-hint";
    intro.textContent = "Drag any node on the map to move it. Click the map to add a node (Add Node mode). Edit pathways below.";
    container.appendChild(intro);

    // Node list
    var nodesSection = document.createElement("div");
    nodesSection.className = "editor-section";
    nodesSection.innerHTML =
      "<h4>All Nodes (" + graph.getAllNodes().length + ")</h4>" +
      '<table class="editor-table"><thead><tr><th scope="col">Node</th><th scope="col">Type</th><th scope="col">X</th><th scope="col">Y</th><th scope="col">Actions</th></tr></thead><tbody></tbody></table>';
    var tbody = nodesSection.querySelector("tbody");
    graph.getAllNodes().slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (node) {
      var row = document.createElement("tr");
      var isDest = node.type !== "intersection" && node.type !== "connector";
      row.innerHTML =
        "<td><strong>" + esc(node.name) + "</strong><br><small class=\"edge-label\">" + esc(node.type) + "</small></td>" +
        "<td><span class=\"edge-cost\">" + node.type + "</span></td>" +
        "<td><input type=\"number\" class=\"input-node-x\" value=\"" + Math.round(node.x) + "\" data-id=\"" + esc(node.id) + "\"></td>" +
        "<td><input type=\"number\" class=\"input-node-y\" value=\"" + Math.round(node.y) + "\" data-id=\"" + esc(node.id) + "\"></td>" +
        "<td>" + (isDest ? '' : '<button class="button button-small button-ghost delete-node" data-id="' + esc(node.id) + '">Delete</button>') + "</td>";
      tbody.appendChild(row);
    });
    container.appendChild(nodesSection);

    // Node coordinate handlers
    nodesSection.querySelectorAll(".input-node-x").forEach(function (input) {
      input.addEventListener("change", function () {
        var id = input.getAttribute("data-id");
        var x = parseFloat(input.value);
        var yInput = nodesSection.querySelector('.input-node-y[data-id="' + esc(input.getAttribute("data-id")) + '"]');
        var y = yInput ? parseFloat(yInput.value) : 0;
        graph.moveNode(id, x, y);
        buildMap();
        run();
      });
    });
    nodesSection.querySelectorAll(".input-node-y").forEach(function (input) {
      input.addEventListener("change", function () {
        var id = input.getAttribute("data-id");
        var y = parseFloat(input.value);
        var xInput = nodesSection.querySelector('.input-node-x[data-id="' + esc(input.getAttribute("data-id")) + '"]');
        var x = xInput ? parseFloat(xInput.value) : 0;
        graph.moveNode(id, x, y);
        buildMap();
        run();
      });
    });
    nodesSection.querySelectorAll(".delete-node").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-id");
        if (confirm("Delete node \"" + graph.getNode(id).name + "\"?")) {
          graph.removeNode(id);
          buildMap();
          populateSelects();
          renderEditor();
          syncBlockedEdges(blockedEdges());
          run();
        }
      });
    });

    // Pathway table
    var pathSection = document.createElement("div");
    pathSection.className = "editor-section";
    pathSection.innerHTML =
      "<h4>Pathways (" + graph.getAllEdges().length + ")</h4>" +
      '<table class="editor-table"><thead><tr><th scope="col">Pathway</th><th scope="col">Cost (m)</th><th scope="col">Detour</th><th scope="col">Blocked</th><th scope="col">Actions</th></tr></thead><tbody></tbody></table>';
    var ptbody = pathSection.querySelector("tbody");
    graph.getAllEdges().slice().sort(function (a, b) {
      return (a.a + a.b).localeCompare(b.a + b.b);
    }).forEach(function (edge) {
      var row = document.createElement("tr");
      var fromName = byId.get(edge.a).name;
      var toName = byId.get(edge.b).name;
      var isBlocked = Data.obstacles.some(function (o) { return o.edgeId === edge.id; });
      row.innerHTML =
        "<td><strong>" + esc(fromName) + "</strong> → <strong>" + esc(toName) + "</strong><br><small class=\"edge-label\">" + esc(edge.label) + "</small></td>" +
        "<td><span class=\"edge-cost\">" + fmt(edge.cost) + "</span></td>" +
        "<td><input type=\"number\" class=\"input-edge-detour\" value=\"" + edge.detour.toFixed(2) + "\" min=\"1\" step=\"0.01\" data-edge=\"" + esc(edge.id) + "\"></td>" +
        "<td><label class=\"toggle-row\"><input type=\"checkbox\" class=\"input-edge-blocked\" data-edge=\"" + esc(edge.id) + "\" " + (isBlocked ? "checked" : "") + "><span class=\"toggle-slider\"></span></label></td>" +
        "<td><button class=\"button button-small button-ghost delete-edge\" data-edge=\"" + esc(edge.id) + "\">Delete</button></td>";
      ptbody.appendChild(row);
    });
    container.appendChild(pathSection);

    pathSection.querySelectorAll(".input-edge-detour").forEach(function (input) {
      input.addEventListener("change", function () {
        var edgeIdValue = input.getAttribute("data-edge");
        graph.setEdgeDetour(edgeIdValue, input.value);
        renderEditor();
        buildMap();
        syncBlockedEdges(blockedEdges());
        run();
      });
    });
    pathSection.querySelectorAll(".input-edge-blocked").forEach(function (checkbox) {
      checkbox.addEventListener("change", function () {
        var edgeIdValue = checkbox.getAttribute("data-edge");
        graph.setEdgeBlocked(edgeIdValue, checkbox.checked);
        renderEditor();
        buildMap();
        syncBlockedEdges(blockedEdges());
        run();
      });
    });
    pathSection.querySelectorAll(".delete-edge").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var edgeIdValue = btn.getAttribute("data-edge");
        if (confirm("Remove this pathway?")) {
          graph.removeEdge(edgeIdValue);
          renderEditor();
          buildMap();
          syncBlockedEdges(blockedEdges());
          run();
        }
      });
    });

    // Add pathway form
    var form = document.createElement("div");
    form.className = "editor-form";
    form.innerHTML =
      "<h4>Add pathway</h4>" +
      "<div class=\"editor-row\">" +
      "<label>From</label>" +
      "<label>To</label>" +
      "<label>Detour</label>" +
      "<label style=\"display:none;\">&nbsp;</label>" +
      "</div>" +
      "<div class=\"editor-row inputs\">" +
      "<select class=\"input-add-a\"></select>" +
      "<select class=\"input-add-b\"></select>" +
      "<input type=\"number\" class=\"input-add-detour\" value=\"1.00\" min=\"1\" step=\"0.01\">" +
      "<button class=\"button button-primary button-small add-pathway\">Add</button>" +
      "</div>";

    container.appendChild(form);

    var selectA = form.querySelector(".input-add-a");
    var selectB = form.querySelector(".input-add-b");
    graph.getAllNodes().forEach(function (node) {
      var o1 = new Option(node.name + " (" + node.type + ")", node.id);
      var o2 = new Option(node.name + " (" + node.type + ")", node.id);
      selectA.appendChild(o1);
      selectB.appendChild(o2);
    });

    form.querySelector(".add-pathway").addEventListener("click", function () {
      var a = selectA.value;
      var b = selectB.value;
      var detour = form.querySelector(".input-add-detour").value;
      if (!a || !b || a === b) {
        alert("Please choose two different locations.");
        return;
      }
      try {
        graph.addEdge(a, b, null, detour);
        renderEditor();
        buildMap();
        syncBlockedEdges(blockedEdges());
        run();
      } catch (err) {
        alert(err.message);
      }
    });
  }

  /* ---------- Search ---------- */

  function run() {
    var startId = els.start.value;
    var goalId = els.goal.value;
    var blocked = blockedEdges();
    syncBlockedEdges(blocked);
    clearRouteVisuals();

    if (!startId || !goalId) {
      setStatus("Waiting for a route", "idle");
      els.results.innerHTML = emptyState("Choose two locations", "Select a start and a destination, or click two points on the campus map.", "icon-target");
      return;
    }

    var result = Agent.aStar(graph, startId, goalId, { blocked: blocked });
    if (!result.found) {
      setStatus("No route available", "error");
      els.results.innerHTML = emptyState("No available route found", "The blocked paths disconnect " + byId.get(startId).name + " from " + byId.get(goalId).name + ". Re-enable a walkway and try again.", "icon-alert");
      return;
    }

    var baseline = Agent.dijkstra(graph, startId, goalId, { blocked: blocked });
    setStatus("Optimal route found", "success");
    els.results.innerHTML = resultHTML(result, baseline, startId, goalId);
    drawRoute(result.path);
    markNodes(result.path, startId, goalId);
  }

  /* ---------- Events ---------- */

  function bindEvents() {
    els.start.addEventListener("change", run);
    els.goal.addEventListener("change", run);
    els.find.addEventListener("click", run);

    els.swap.addEventListener("click", function () {
      var previous = els.start.value;
      els.start.value = els.goal.value;
      els.goal.value = previous;
      run();
    });

    els.clear.addEventListener("click", function () {
      els.start.value = "";
      els.goal.value = "";
      els.obstacles.querySelectorAll("input").forEach(function (input) { input.checked = false; });
      setMode("start");
      run();
    });

    els.segments.forEach(function (button) {
      button.addEventListener("click", function () { setMode(button.dataset.mode); });
    });

    els.nodeLayer.addEventListener("click", function (event) {
      if (addingNode) {
        var mapShell = document.querySelector(".map-shell");
        var mRect = mapShell.getBoundingClientRect();
        var x = ((event.clientX - mRect.left) / mRect.width) * MAP.width;
        var y = ((event.clientY - mRect.top) / mRect.height) * MAP.height;
        addNodeAt(x, y);
        return;
      }
      if (!editMode) {
        var button = event.target.closest(".map-node");
        if (!button) return;
        var id = button.dataset.id;
        if (mapMode === "start") {
          els.start.value = id;
          if (!els.goal.value) setMode("goal");
        } else {
          els.goal.value = id;
          setMode("start");
        }
        run();
      }
    });

    els.obstacles.addEventListener("change", run);

    els.editToggle.addEventListener("click", toggleEditMode);
    els.addNodeBtn.addEventListener("click", enableAddNodeMode);

    els.themeToggle.addEventListener("click", function () {
      var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      applyTheme(next);
      storeTheme(next);
    });
  }

  /* ---------- Boot ---------- */

  function init() {
    var stored = savedTheme();
    applyTheme(stored || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));

    populateSelects();
    buildMap();
    buildObstacles();
    bindEvents();
    setMode("start");
    renderEditor();

    run();
  }

  init();
})();
