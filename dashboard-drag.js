/*\
title: $:/plugins/rimir/dashboard/dashboard-drag.js
type: application/javascript
module-type: widget

Absolutely-positioned, pointer-draggable + resizable box for the rimir/dashboard
plugin.

Regions (matched via closest() on the pointerdown target):
  .rr-dash-no-drag  never starts anything (buttons, links, inputs)
  .rr-dash-resize   starts a resize drag
  move-selector     starts a move drag; when the `move-selector` attribute is
                    empty the whole box is a move surface (bare tiles)

Move / resize move the DOM directly for smoothness and commit ONCE on release
via the `actions` string (variables new-x / new-y / new-w / new-h) — never
per pointermove, to avoid async write races.

A pointerdown+up on a move surface with no motion beyond DRAG_THRESHOLD is a
CLICK: it invokes `open-actions` instead (used to open the tile's target in the
story river). Geometry commits also carry a fresh `z` so the tile comes to the
front; the widget renders `z-index` from the `z` attribute.

Reparenting: on release after a MOVE, the drop point is hit-tested against the
`.rr-dash-canvas` elements (the widget hides itself with visibility:hidden so
elementFromPoint sees the canvas beneath). If the topmost canvas under the
pointer differs from the tile's current container — and belongs to the same
dashboard and is not the tile's own descendant — the `reparent-actions` string
is invoked with the extra `new-parent` variable and coordinates relative to the
target canvas. Otherwise the ordinary `actions` (geometry) commit runs.

`fit-width="yes"` / `fit-height="yes"` render the box at auto (shrink-to-fit)
width / height — used for collapsed group tiles, which shrink to their header;
the stored `w`/`h` are preserved (not applied) and restored on expand.

A collapsed-to-icon tile carries a `.rr-dash-resize-icon` grip. Dragging it is a
"resize-icon" drag: it sizes the `.rr-dash-group-icon-lg` element directly and, on
release, commits the new box via `size-actions` (variables new-icon-w / new-icon-h)
instead of the geometry `actions` — so each tile's collapsed icon is individually
sizable while the shrink-to-fit box tracks it.

Holding Ctrl/Cmd when a move starts on a tile that has `copy-actions` turns the
drag into a DUPLICATE: on release the `copy-actions` string is invoked (creating
a new tile at the drop location/container) and the original snaps back to its
start — so a tiddler can appear on the dashboard any number of times.
\*/
"use strict";

var Widget = require("$:/core/modules/widgets/widget.js").widget;

var DRAG_THRESHOLD = 4; // px of motion before a grab counts as a move (not a click)
var MIN_ICON = 24; // px floor for a collapsed tile's resizable icon box

var DashboardDragWidget = function(parseTreeNode,options) {
	this.initialise(parseTreeNode,options);
};

DashboardDragWidget.prototype = Object.create(Widget.prototype);

DashboardDragWidget.prototype.render = function(parent,nextSibling) {
	var self = this;
	this.parentDomNode = parent;
	this.computeAttributes();
	this.execute();
	var domNode = this.document.createElement("div");
	this.domNode = domNode;
	domNode.className = this.boxClass;
	this.applyGeometry();
	this.applyZ();
	domNode.addEventListener("pointerdown",function(event){ self.handlePointerDown(event); },false);
	parent.insertBefore(domNode,nextSibling);
	this.renderChildren(domNode,null);
	this.domNodes.push(domNode);
};

DashboardDragWidget.prototype.execute = function() {
	this.tileTitle = this.getAttribute("tile");
	this.dragActions = this.getAttribute("actions","");
	this.reparentActions = this.getAttribute("reparent-actions","");
	this.copyActions = this.getAttribute("copy-actions","");
	this.sizeActions = this.getAttribute("size-actions","");
	this.openActions = this.getAttribute("open-actions","");
	this.ctrlOpenUrl = this.getAttribute("ctrl-open-url","");
	this.boxClass = this.getAttribute("class","rr-dash-box");
	this.moveSelector = this.getAttribute("move-selector","");
	this.containerId = this.getAttribute("container","");
	this.dashId = this.getAttribute("dash-id","");
	this.fitWidth = (this.getAttribute("fit-width","") === "yes");
	this.fitHeight = (this.getAttribute("fit-height","") === "yes");
	this.geoX = this.num(this.getAttribute("x"),0);
	this.geoY = this.num(this.getAttribute("y"),0);
	this.geoW = this.num(this.getAttribute("w"),320);
	this.geoH = this.num(this.getAttribute("h"),220);
	this.geoZ = this.getAttribute("z","");
	this.minW = this.num(this.getAttribute("min-width"),120);
	this.minH = this.num(this.getAttribute("min-height"),80);
	this.makeChildWidgets();
};

DashboardDragWidget.prototype.num = function(value,fallback) {
	var n = parseFloat(value);
	return isNaN(n) ? fallback : n;
};

/*
Effective visual scale of a canvas element: its on-screen width (affected by any
ancestor CSS transform — e.g. the fit-to-screen zoom) over its layout width
(unaffected by transforms). 1 when the board is at natural size. Used to convert
screen-pixel pointer deltas back into the canvas' own coordinate space so drag /
resize / reparent stay accurate while the board is scaled to fit.
*/
DashboardDragWidget.prototype.canvasScale = function(canvas) {
	if(!canvas || !canvas.getBoundingClientRect) { return 1; }
	var w = canvas.getBoundingClientRect().width,
		lw = canvas.offsetWidth;
	return (w > 0 && lw > 0) ? (w / lw) : 1;
};

DashboardDragWidget.prototype.applyGeometry = function() {
	var s = this.domNode.style;
	s.position = "absolute";
	s.left = this.geoX + "px";
	s.top = this.geoY + "px";
	s.width = this.fitWidth ? "" : (this.geoW + "px");
	s.height = this.fitHeight ? "" : (this.geoH + "px");
};

DashboardDragWidget.prototype.applyZ = function() {
	// Drive stacking through a CSS custom property (read by .rr-dash-box as
	// `z-index: var(--rr-dash-z)` in the stylesheet) rather than an inline
	// z-index, so hover / drag CSS rules can lift a tile — and, via :has(), its
	// ancestor groups — above their siblings WITHOUT !important (an inline
	// z-index would always win over a stylesheet rule). The inline z-index is
	// cleared here; it is set directly (to 9999) only for the duration of an
	// active drag, where winning over the CSS var is exactly what we want.
	var z = (this.geoZ === "" || this.geoZ === null || this.geoZ === undefined) ? "" : this.geoZ;
	this.domNode.style.zIndex = "";
	if(z === "") {
		this.domNode.style.removeProperty("--rr-dash-z");
	} else {
		this.domNode.style.setProperty("--rr-dash-z",z);
	}
};

DashboardDragWidget.prototype.handlePointerDown = function(event) {
	var target = event.target;
	if(target.closest && target.closest(".rr-dash-no-drag")) {
		return; // buttons / links / inputs handle their own clicks
	}
	var mode = null;
	if(target.closest && target.closest(".rr-dash-resize-icon")) {
		mode = "resize-icon";
	} else if(target.closest && target.closest(".rr-dash-resize")) {
		mode = "resize";
	} else if(!this.moveSelector) {
		mode = "grab"; // whole box is a move/open surface (bare tiles)
	} else if(target.closest && target.closest(this.moveSelector)) {
		mode = "grab";
	}
	if(!mode) {
		return;
	}
	event.preventDefault();
	event.stopPropagation();
	this.dragMode = mode;
	this.moved = false;
	// Convert screen-pixel deltas to canvas coordinates when the board is scaled
	// to fit (the containing canvas reports its cumulative on-screen scale).
	this.dragScale = this.canvasScale(this.domNode.closest && this.domNode.closest(".rr-dash-canvas"));
	this.startX = event.clientX;
	this.startY = event.clientY;
	this.startGeoX = this.geoX;
	this.startGeoY = this.geoY;
	this.startGeoW = this.geoW;
	this.startGeoH = this.geoH;
	if(mode === "resize-icon") {
		this.startIconW = this.num(this.getAttribute("icon-w"),64);
		this.startIconH = this.num(this.getAttribute("icon-h"),64);
		this.iconW = this.startIconW;
		this.iconH = this.startIconH;
		this.iconEl = this.domNode.querySelector(".rr-dash-group-icon-lg");
	}
	$tw.utils.addClass(this.domNode,"rr-dash-dragging");
	// Ctrl/Cmd at grab-start on a copyable (content) tile → duplicate instead of move
	this.copyDrag = (mode === "grab") && !!this.copyActions && !!(event.ctrlKey || event.metaKey);
	if(this.copyDrag) {
		$tw.utils.addClass(this.domNode,"rr-dash-copying");
	}
	this.domNode.style.zIndex = "9999";
	var self = this;
	this._onMove = function(e){ self.handlePointerMove(e); };
	this._onUp = function(e){ self.handlePointerUp(e); };
	try { this.domNode.setPointerCapture(event.pointerId); } catch(e) {}
	this.domNode.addEventListener("pointermove",this._onMove,false);
	this.domNode.addEventListener("pointerup",this._onUp,false);
	this.domNode.addEventListener("pointercancel",this._onUp,false);
};

DashboardDragWidget.prototype.handlePointerMove = function(event) {
	if(!this.dragMode) {
		return;
	}
	var scale = this.dragScale || 1,
		dx = (event.clientX - this.startX) / scale,
		dy = (event.clientY - this.startY) / scale;
	if(this.dragMode === "grab") {
		if(!this.moved) {
			// Click tolerance is in screen pixels, so test the raw (un-scaled) motion.
			if(Math.abs(event.clientX - this.startX) < DRAG_THRESHOLD &&
					Math.abs(event.clientY - this.startY) < DRAG_THRESHOLD) {
				return; // still within click tolerance
			}
			this.moved = true;
		}
		this.geoX = Math.max(0,Math.round(this.startGeoX + dx));
		this.geoY = Math.max(0,Math.round(this.startGeoY + dy));
		this.applyGeometry();
	} else if(this.dragMode === "resize-icon") {
		this.moved = true;
		this.iconW = Math.max(MIN_ICON,Math.round(this.startIconW + dx));
		this.iconH = Math.max(MIN_ICON,Math.round(this.startIconH + dy));
		if(this.iconEl) {
			this.iconEl.style.width = this.iconW + "px";
			this.iconEl.style.height = this.iconH + "px";
		}
	} else {
		this.moved = true;
		this.geoW = Math.max(this.minW,Math.round(this.startGeoW + dx));
		this.geoH = Math.max(this.minH,Math.round(this.startGeoH + dy));
		this.applyGeometry();
	}
};

DashboardDragWidget.prototype.handlePointerUp = function(event) {
	if(!this.dragMode) {
		return;
	}
	var mode = this.dragMode;
	this.dragMode = null;
	$tw.utils.removeClass(this.domNode,"rr-dash-dragging");
	$tw.utils.removeClass(this.domNode,"rr-dash-copying");
	this.domNode.removeEventListener("pointermove",this._onMove,false);
	this.domNode.removeEventListener("pointerup",this._onUp,false);
	this.domNode.removeEventListener("pointercancel",this._onUp,false);
	try { this.domNode.releasePointerCapture(event.pointerId); } catch(e) {}
	this.applyZ(); // restore stacking from the stored z (drag commit will refresh it)
	if(mode === "grab" && !this.moved) {
		// Ctrl/Cmd-click opens the tile's external target (url / _canonical_uri,
		// resolved in wikitext) in a new browser tab — like Ctrl-clicking a link.
		if((event.ctrlKey || event.metaKey) && this.ctrlOpenUrl) {
			var extUrl = this.ctrlOpenUrl;
			// Absolute (scheme:, //host, /path) URLs pass through; bare hosts get https://
			if(!/^([a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(extUrl)) {
				extUrl = "https://" + extUrl;
			}
			window.open(extUrl,"_blank","noopener");
			return;
		}
		if(this.openActions) {
			this.invokeActionString(this.openActions,this,event,{});
		}
		return;
	}
	// Resizing a collapsed tile's icon commits the new icon box only (no geometry
	// move / reparent): the shrink-to-fit box follows the icon automatically.
	if(mode === "resize-icon") {
		if(this.sizeActions) {
			this.invokeActionString(this.sizeActions,this,event,{
				"new-icon-w": String(this.iconW),
				"new-icon-h": String(this.iconH)
			});
		}
		return;
	}
	// Ctrl/Cmd-drag on a content tile duplicates it at the drop location and
	// leaves the original untouched (a tile may target the same tiddler freely)
	if(mode === "grab" && this.moved && this.copyDrag && this.copyActions) {
		var dropCanvas = this.hitTestCanvas(event);
		var sameDash = dropCanvas && dropCanvas.dashId === this.dashId;
		this.invokeActionString(this.copyActions,this,event,{
			"new-parent": sameDash ? dropCanvas.parent : this.containerId,
			"new-x": String(sameDash ? dropCanvas.x : this.geoX),
			"new-y": String(sameDash ? dropCanvas.y : this.geoY),
			"new-w": String(this.geoW),
			"new-h": String(this.geoH)
		});
		// the original was only moved visually during the drag — snap it back
		this.geoX = this.startGeoX;
		this.geoY = this.startGeoY;
		this.applyGeometry();
		return;
	}
	// A move (grab + motion) or a resize: try reparenting first, else commit geometry
	var reparented = false;
	if(mode === "grab" && this.moved && this.reparentActions) {
		var target = this.hitTestCanvas(event);
		if(target && target.dashId === this.dashId && target.parent !== this.containerId &&
				!this.domNode.contains(target.canvas)) {
			this.invokeActionString(this.reparentActions,this,event,{
				"new-parent": target.parent,
				"new-x": String(target.x),
				"new-y": String(target.y),
				"new-w": String(this.geoW),
				"new-h": String(this.geoH)
			});
			reparented = true;
		}
	}
	if(!reparented && this.dragActions) {
		this.invokeActionString(this.dragActions,this,event,{
			"new-x": String(this.geoX),
			"new-y": String(this.geoY),
			"new-w": String(this.geoW),
			"new-h": String(this.geoH)
		});
	}
};

/*
Find the .rr-dash-canvas under the pointer, if any, returning its container id,
dashboard id, and the tile's position relative to that canvas. The widget hides
itself (and thus its whole subtree) so elementFromPoint reports the canvas
beneath rather than the tile being dragged — which also means a group dropped
onto its own contents resolves to its current container and does not reparent.
*/
DashboardDragWidget.prototype.hitTestCanvas = function(event) {
	var doc = this.document;
	if(!doc || !doc.elementFromPoint) {
		return null; // fake document (CLI render) has no hit-testing
	}
	var tileRect = this.domNode.getBoundingClientRect();
	var prevVisibility = this.domNode.style.visibility;
	this.domNode.style.visibility = "hidden";
	var el = doc.elementFromPoint(event.clientX,event.clientY);
	this.domNode.style.visibility = prevVisibility;
	if(!el || !el.closest) {
		return null;
	}
	var canvas = el.closest(".rr-dash-canvas");
	if(!canvas) {
		return null;
	}
	var canvasRect = canvas.getBoundingClientRect(),
		scale = this.canvasScale(canvas); // fit-to-screen zoom → convert back to canvas coords
	return {
		canvas: canvas,
		parent: canvas.getAttribute("data-dash-parent") || "",
		dashId: canvas.getAttribute("data-dash-id") || "",
		x: Math.max(0,Math.round((tileRect.left - canvasRect.left) / scale + canvas.scrollLeft)),
		y: Math.max(0,Math.round((tileRect.top - canvasRect.top) / scale + canvas.scrollTop))
	};
};

DashboardDragWidget.prototype.refresh = function(changedTiddlers) {
	var changed = this.computeAttributes();
	if(changed.tile || changed["class"] || changed["move-selector"] || changed.actions ||
			changed["reparent-actions"] || changed["copy-actions"] || changed["open-actions"] ||
			changed["size-actions"] || changed["ctrl-open-url"] ||
			changed["min-width"] || changed["min-height"] || changed.container || changed["dash-id"] ||
			changed["fit-width"] || changed["fit-height"]) {
		this.refreshSelf();
		return true;
	}
	var geoChanged = false;
	if(changed.x || changed.y || changed.w || changed.h) {
		this.geoX = this.num(this.getAttribute("x"),this.geoX);
		this.geoY = this.num(this.getAttribute("y"),this.geoY);
		this.geoW = this.num(this.getAttribute("w"),this.geoW);
		this.geoH = this.num(this.getAttribute("h"),this.geoH);
		geoChanged = true;
	}
	if(changed.z) {
		this.geoZ = this.getAttribute("z","");
		if(!this.dragMode) { this.applyZ(); }
	}
	if(geoChanged && !this.dragMode) {
		this.applyGeometry();
	}
	return this.refreshChildren(changedTiddlers);
};

exports["dashboard-drag"] = DashboardDragWidget;
