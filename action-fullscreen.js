/*\
title: $:/plugins/rimir/dashboard/action-fullscreen.js
type: application/javascript
module-type: widget

Action widget `<$action-rr-dash-fullscreen>` — toggles the browser Fullscreen API
on the nearest matching ancestor element (default `.rr-dash-root`, i.e. the
dashboard itself, so it fills the physical screen without the surrounding wiki
chrome). Fires from a button click, which is the required user gesture.

Attributes:
  selector   CSS selector for the element to make fullscreen (default .rr-dash-root)

Fullscreen state is not written here — the dashboard-fit widget listens for
`fullscreenchange` and keeps `$:/state/rimir/dashboard/fullscreen` in sync (so
pressing Esc updates the toggle too).
\*/
"use strict";

var Widget = require("$:/core/modules/widgets/widget.js").widget;

var ActionFullscreenWidget = function(parseTreeNode,options) {
	this.initialise(parseTreeNode,options);
};

ActionFullscreenWidget.prototype = Object.create(Widget.prototype);

ActionFullscreenWidget.prototype.render = function(parent,nextSibling) {
	this.parentDomNode = parent;
	this.computeAttributes();
	this.execute();
};

ActionFullscreenWidget.prototype.execute = function() {
	this.selector = this.getAttribute("selector",".rr-dash-root");
};

ActionFullscreenWidget.prototype.refresh = function(changedTiddlers) {
	var changedAttributes = this.computeAttributes();
	if(changedAttributes.selector) {
		this.refreshSelf();
		return true;
	}
	return false;
};

ActionFullscreenWidget.prototype.invokeAction = function(triggeringWidget,event) {
	var doc = this.document;
	if(!doc || !doc.documentElement) { return true; } // fake document (CLI) — no-op
	var target = (this.parentDomNode && this.parentDomNode.closest) ?
		this.parentDomNode.closest(this.selector) : null;
	if(!target && doc.querySelector) { target = doc.querySelector(this.selector); }
	if(!target) { return true; }
	var fsEl = doc.fullscreenElement || doc.webkitFullscreenElement || null;
	if(fsEl) {
		var exit = doc.exitFullscreen || doc.webkitExitFullscreen;
		if(exit) { try { exit.call(doc); } catch(e) {} }
	} else {
		var req = target.requestFullscreen || target.webkitRequestFullscreen;
		if(req) { try { req.call(target); } catch(e) {} }
	}
	return true; // handled
};

exports["action-rr-dash-fullscreen"] = ActionFullscreenWidget;
