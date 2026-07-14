# tw-dashboard

A TiddlyWiki 5 plugin (`$:/plugins/rimir/dashboard`) that turns any tiddler into a **free-form dashboard**: a canvas onto which you drop other tiddlers as freely arrangeable tiles.

## What it does

- Tag a tiddler with `$:/tags/rimir/dashboard` and its body becomes a canvas.
- **Add tiles** by dragging tiddlers onto the canvas from anywhere in the wiki, or by typing a title and pressing *Add tile*.
- **Batch-add by filter** — type a filter in the box above the canvas and press *Add matching* to drop a tile for every tiddler it selects, arranged in a grid.
- **Clean** — remove tiles in one go (with a confirmation). Leave the clean filter empty to clear the whole dashboard, or give a filter to remove only the tiles whose target it selects.
- **Fit to screen** — a toolbar toggle that scales the whole board down so everything is visible at once, sized to fit your window — handy on a small display. Shrink-only, remembered per dashboard, and dragging/resizing stays accurate while fitted.
- **Fullscreen** — a toolbar button that shows the dashboard fullscreen (the whole screen, without the wiki chrome); press again or Esc to exit. Combine with *Fit to screen* to see the entire board at once.
- **Move** a tile by dragging its title bar; **resize** it from the bottom-right corner. Geometry is saved on release.
- **Bring-to-front** — interacting with a tile raises it; the `z`-order persists.
- **Two styles** per tile: a *window* tile with a title bar, or a *bare* tile that is just the resizable content.
- **Actions menu** — each tile's actions live behind a ⋮ menu in the corner that opens on hover or keyboard focus: ↗ open-external (when available), ⧉ show-in-popup, ⊟ toggle window/bare, × remove.
- **Collapse a tile** — window tiles have a ▸/▾ toggle: a collapsed tile shrinks to just its headline, or — if its target has an `icon` — to just that icon (click to expand, drag to move, hover for the caption).
- **Drop onto a collapsed tile** — a collapsed tile or group is still a drop target: drop a tiddler or file onto a collapsed *group* to add it as a child (the group then expands), or drop a file onto a collapsed *content tile* whose target is under `work/` to file it alongside that item. No extra chrome — the box is just outlined while you drag over it.
- **Choose what a tile shows** — a tile transcludes its target's body by default; an uploaded image or PDF (with a `_thumbnail_uri`) shows its **thumbnail**, and a tiddler with no text but an `icon` shows the icon. Override per tile from the ⋮ menu (*Show*: auto / body / icon, or any field name), or set per-dashboard **display rules** (a target filter → the field to show) from the *Display rules* panel.
- **Group (meta) tiles** — *Add group* creates a container tile that is itself a mini-canvas: drop tiddlers into it, drag existing tiles in and out, and nest groups inside groups recursively. Collapse to a header bar with ▸/▾, rename inline, and see the child count. Give a group an `icon` and it shows small before the name — or, when collapsed, becomes the whole header (hover for the name, click to expand). Removing a group promotes its contents to the parent container.
- **Click to open** — a click (not a drag) opens the tile's target tiddler in the story river.
- **Open a link in a new browser tab** — if a tile's target carries a `url` (or `_canonical_uri`) field, the tile shows an ↗ action and **Ctrl/Cmd-clicking** the tile opens that address in a new browser tab (an uploaded image or file tile opens its raw file this way). Plain click still opens the target in the wiki. The fields consulted and their priority are configurable.
- **Ctrl-drag to duplicate** — hold Ctrl (or Cmd) as you start dragging a tile to drop a *copy* of it elsewhere (even into another group), leaving the original in place. The same tiddler can appear on as many tiles as you like.
- **Show contents in a popup** — the ⧉ control opens the target in a centered popup rendered through TiddlyWiki's default ViewTemplate (title, tags, fields and body), without leaving the dashboard. Close it with the × button or by clicking the backdrop.
- **Kind-aware** — when a tile's target is a [`rimir/kind`](https://github.com/rimir-cc/tw-kind) instance, the window tile shows the type's icon (with the type name as hover text) before the caption. Degrades silently when kind isn't installed.
- **Edit & extend kind entities** — for a tile whose target is a [`rimir/kind`](https://github.com/rimir-cc/tw-kind) instance, a ✎ *entity* control appears next to the ⋮ menu; hovering it opens a compact popup (the same actions as *Kind: Instances Overview*): **edit** opens the live editor modal, and **Add child** offers a button per kind whose `parent` accepts this entity's type — creating the child with `parent` pre-set (same validation/title-formula as the Creator) *and dropping a tile for it into the same group as the source tile*. Only shown when kind is installed and the target is an instance.

## Quick start

1. Click **New dashboard** in the page controls (right sidebar → Tools), or tag any tiddler `$:/tags/rimir/dashboard`.
2. Drag a few tiddlers onto the canvas.
3. Move, resize, and restyle them; click one to open it.

## Storage

Each tile is its own system tiddler tagged `$:/tags/rimir/dashboard/tile`, stored under
`$:/config/rimir/dashboard/<dashboard-id>/tiles/…` with plain fields (`target`, `x`, `y`, `w`, `h`, `z`, `style`). No JSON blobs — every mutation is an ordinary `$action-setfield`.

## Requirements

TiddlyWiki >= 5.4.0. No other plugin dependencies. Rich documentation renders when
[`rimir/doc-template`](https://github.com/rimir-cc/tw-doc-template) is installed.

## License

MIT — see [LICENSE.md](LICENSE.md).
