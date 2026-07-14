/*\
title: $:/plugins/rimir/dashboard/dashboard-fit.js
type: application/javascript
module-type: widget

Wraps the root dashboard canvas and, when `enabled="yes"`, scales it down so the
whole content bounding box fits within the available area — the visible width AND
the remaining viewport height — so everything is visible at once on a small
screen. Shrink-only: a board that already fits is left at natural size.

The content extent is supplied by the caller (`content-width` / `content-height`,
computed in wikitext from the tiles' x/y/w/h). The available width is the
wrapper's own width; the available height runs from the canvas top to the bottom
of the viewport. The scale is applied as a CSS transform on the `.rr-dash-canvas`
element, whose layout box is set to the content size so nothing is clipped by the
canvas' own overflow; the wrapper then clips the (unscaled) overflow and reserves
the scaled height so surrounding page layout stays correct.

The drag widget derives the effective scale itself (rect.width / offsetWidth of
the containing canvas), so no shared state is needed for pointer dragging to stay
accurate while fitted.

Re-fits on container resize (ResizeObserver on the stable parent — never the
wrapper whose height we mutate), on window resize, and on every widget refresh
(tiles added / moved / removed change the extent), debounced to an animation
frame and guarded so a no-op fit writes nothing (breaking any observer feedback).
\*/
"use strict";

var Widget = require("$:/core/modules/widgets/widget.js").widget;

var DashboardFitWidget = function(parseTreeNode,options) {
	this.initialise(parseTreeNode,options);
};

DashboardFitWidget.prototype = Object.create(Widget.prototype);

DashboardFitWidget.prototype.render = function(parent,nextSibling) {
	this.parentDomNode = parent;
	this.computeAttributes();
	this.execute();
	var domNode = this.document.createElement("div");
	this.domNode = domNode;
	domNode.className = this.getAttribute("class","rr-dash-fit");
	parent.insertBefore(domNode,nextSibling);
	this.renderChildren(domNode,null);
	this.domNodes.push(domNode);
	this.setupObservers();
	this.scheduleFit();
};

DashboardFitWidget.prototype.execute = function() {
	this.makeChildWidgets();
};

DashboardFitWidget.prototype.num = function(value,fallback) {
	var n = parseFloat(value);
	return isNaN(n) ? fallback : n;
};

DashboardFitWidget.prototype.setupObservers = function() {
	var self = this;
	if(this._observing || typeof window === "undefined") { return; }
	this._onWinResize = function(){ self.scheduleFit(); };
	window.addEventListener("resize",this._onWinResize,false);
	// Keep the fullscreen toggle in sync (including Esc-to-exit) and re-fit, since
	// entering / leaving fullscreen changes the available width and height.
	this._onFsChange = function(){ self.onFullscreenChange(); };
	this.document.addEventListener("fullscreenchange",this._onFsChange,false);
	this.document.addEventListener("webkitfullscreenchange",this._onFsChange,false);
	if(typeof window.ResizeObserver === "function" && this.domNode.parentNode) {
		// Observe the STABLE parent for its width — never the wrapper whose height
		// we mutate — so applying a fit can't feed straight back into a resize loop.
		this._ro = new window.ResizeObserver(function(){ self.scheduleFit(); });
		this._ro.observe(this.domNode.parentNode);
	}
	this._observing = true;
};

DashboardFitWidget.prototype.onFullscreenChange = function() {
	var doc = this.document,
		fs = !!(doc.fullscreenElement || doc.webkitFullscreenElement);
	this.wiki.setText("$:/state/rimir/dashboard/fullscreen","text",null,fs ? "yes" : "no");
	this.scheduleFit();
};

DashboardFitWidget.prototype.scheduleFit = function() {
	var self = this;
	if(this._raf) { return; }
	if(typeof window === "undefined" || !window.requestAnimationFrame) {
		this.applyFit();
		return;
	}
	this._raf = window.requestAnimationFrame(function(){
		self._raf = null;
		self.applyFit();
	});
};

DashboardFitWidget.prototype.applyFit = function() {
	if(!this.domNode.querySelector) { return; } // fake document (CLI render) — no DOM
	var canvas = this.domNode.querySelector(".rr-dash-canvas");
	if(!canvas) { return; }
	var enabled = (this.getAttribute("enabled","no") === "yes"),
		contentW = this.num(this.getAttribute("content-width"),0),
		contentH = this.num(this.getAttribute("content-height"),0),
		availW = this.domNode.clientWidth,
		f = 1;
	if(enabled && contentW > 0 && contentH > 0 && availW > 0) {
		var top = canvas.getBoundingClientRect().top,
			availH = (typeof window !== "undefined" ? (window.innerHeight || 0) : 0) - top - 16;
		f = availW / contentW;
		if(availH > 0) { f = Math.min(f,availH / contentH); }
		f = f >= 1 ? 1 : Math.round(f * 1000) / 1000; // shrink only
	}
	// Skip if nothing changed — prevents any resize-observer feedback loop.
	if(this._last && this._last.f === f && this._last.contentW === contentW &&
			this._last.contentH === contentH && this._last.availW === availW) {
		return;
	}
	this._last = { f: f, contentW: contentW, contentH: contentH, availW: availW };
	if(f >= 1) {
		this.clearFit(canvas);
		return;
	}
	// Give the canvas a layout box the exact size of its content (so its own
	// overflow never clips anything), then scale the whole box down to fit.
	canvas.style.width = contentW + "px";
	canvas.style.height = contentH + "px";
	canvas.style.minHeight = "0px";
	canvas.style.transformOrigin = "0 0";
	canvas.style.transform = "scale(" + f + ")";
	canvas.setAttribute("data-dash-scale",String(f));
	// Reserve the scaled height and clip the unscaled overflow so the board sits
	// flush in the page while spanning exactly the available width.
	this.domNode.style.overflow = "hidden";
	this.domNode.style.height = Math.ceil(contentH * f) + "px";
	// Mark the wrapper so the fullscreen fill-height CSS stands aside — we are
	// sizing the canvas ourselves.
	$tw.utils.addClass(this.domNode,"rr-dash-fitted");
};

DashboardFitWidget.prototype.clearFit = function(canvas) {
	canvas.style.width = "";
	canvas.style.height = "";
	canvas.style.minHeight = "";
	canvas.style.transformOrigin = "";
	canvas.style.transform = "";
	canvas.removeAttribute("data-dash-scale");
	this.domNode.style.overflow = "";
	this.domNode.style.height = "";
	$tw.utils.removeClass(this.domNode,"rr-dash-fitted");
};

DashboardFitWidget.prototype.refresh = function(changedTiddlers) {
	var changed = this.computeAttributes();
	if(changed["class"]) {
		this.refreshSelf();
		return true;
	}
	var childrenRefreshed = this.refreshChildren(changedTiddlers);
	// enabled / content-width / content-height may have changed, or the tiles
	// themselves — re-fit (applyFit reads the fresh attributes).
	this.scheduleFit();
	return childrenRefreshed;
};

DashboardFitWidget.prototype.removeChildDomNodes = function() {
	if(this._ro) { try { this._ro.disconnect(); } catch(e) {} this._ro = null; }
	if(this._onWinResize && typeof window !== "undefined") {
		window.removeEventListener("resize",this._onWinResize,false);
		this._onWinResize = null;
	}
	if(this._onFsChange) {
		this.document.removeEventListener("fullscreenchange",this._onFsChange,false);
		this.document.removeEventListener("webkitfullscreenchange",this._onFsChange,false);
		this._onFsChange = null;
	}
	this._observing = false;
	this._last = null;
	Widget.prototype.removeChildDomNodes.call(this);
};

exports["dashboard-fit"] = DashboardFitWidget;
