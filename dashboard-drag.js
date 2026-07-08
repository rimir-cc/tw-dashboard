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
\*/
"use strict";

var Widget = require("$:/core/modules/widgets/widget.js").widget;

var DRAG_THRESHOLD = 4; // px of motion before a grab counts as a move (not a click)

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
	this.openActions = this.getAttribute("open-actions","");
	this.boxClass = this.getAttribute("class","rr-dash-box");
	this.moveSelector = this.getAttribute("move-selector","");
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

DashboardDragWidget.prototype.applyGeometry = function() {
	var s = this.domNode.style;
	s.position = "absolute";
	s.left = this.geoX + "px";
	s.top = this.geoY + "px";
	s.width = this.geoW + "px";
	s.height = this.geoH + "px";
};

DashboardDragWidget.prototype.applyZ = function() {
	this.domNode.style.zIndex = (this.geoZ === "" || this.geoZ === null || this.geoZ === undefined) ? "" : this.geoZ;
};

DashboardDragWidget.prototype.handlePointerDown = function(event) {
	var target = event.target;
	if(target.closest && target.closest(".rr-dash-no-drag")) {
		return; // buttons / links / inputs handle their own clicks
	}
	var mode = null;
	if(target.closest && target.closest(".rr-dash-resize")) {
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
	this.startX = event.clientX;
	this.startY = event.clientY;
	this.startGeoX = this.geoX;
	this.startGeoY = this.geoY;
	this.startGeoW = this.geoW;
	this.startGeoH = this.geoH;
	$tw.utils.addClass(this.domNode,"rr-dash-dragging");
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
	var dx = event.clientX - this.startX,
		dy = event.clientY - this.startY;
	if(this.dragMode === "grab") {
		if(!this.moved) {
			if(Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) {
				return; // still within click tolerance
			}
			this.moved = true;
		}
		this.geoX = Math.max(0,Math.round(this.startGeoX + dx));
		this.geoY = Math.max(0,Math.round(this.startGeoY + dy));
		this.applyGeometry();
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
	this.domNode.removeEventListener("pointermove",this._onMove,false);
	this.domNode.removeEventListener("pointerup",this._onUp,false);
	this.domNode.removeEventListener("pointercancel",this._onUp,false);
	try { this.domNode.releasePointerCapture(event.pointerId); } catch(e) {}
	this.applyZ(); // restore stacking from the stored z (drag commit will refresh it)
	if(mode === "grab" && !this.moved) {
		if(this.openActions) {
			this.invokeActionString(this.openActions,this,event,{});
		}
	} else if(this.dragActions) {
		this.invokeActionString(this.dragActions,this,event,{
			"new-x": String(this.geoX),
			"new-y": String(this.geoY),
			"new-w": String(this.geoW),
			"new-h": String(this.geoH)
		});
	}
};

DashboardDragWidget.prototype.refresh = function(changedTiddlers) {
	var changed = this.computeAttributes();
	if(changed.tile || changed["class"] || changed["move-selector"] || changed.actions ||
			changed["open-actions"] || changed["min-width"] || changed["min-height"]) {
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
