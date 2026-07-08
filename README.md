# tw-dashboard

A TiddlyWiki 5 plugin (`$:/plugins/rimir/dashboard`) that turns any tiddler into a **free-form dashboard**: a canvas onto which you drop other tiddlers as freely arrangeable tiles.

## What it does

- Tag a tiddler with `$:/tags/rimir/dashboard` and its body becomes a canvas.
- **Add tiles** by dragging tiddlers onto the canvas from anywhere in the wiki, or by typing a title and pressing *Add tile*.
- **Move** a tile by dragging its title bar; **resize** it from the bottom-right corner. Geometry is saved on release.
- **Bring-to-front** — interacting with a tile raises it; the `z`-order persists.
- **Two styles** per tile: a *window* tile with a title bar, or a *bare* tile that is just the resizable content.
- **Group (meta) tiles** — *Add group* creates a container tile that is itself a mini-canvas: drop tiddlers into it, drag existing tiles in and out, and nest groups inside groups recursively. Collapse to a header bar with ▸/▾, rename inline, and see the child count. Removing a group promotes its contents to the parent container.
- **Click to open** — a click (not a drag) opens the tile's target tiddler in the story river.
- **Ctrl-drag to duplicate** — hold Ctrl (or Cmd) as you start dragging a tile to drop a *copy* of it elsewhere (even into another group), leaving the original in place. The same tiddler can appear on as many tiles as you like.
- **Show contents in a popup** — the ⧉ control opens the target in a centered popup rendered through TiddlyWiki's default ViewTemplate (title, tags, fields and body), without leaving the dashboard. Close it with the × button or by clicking the backdrop.
- **Kind-aware** — when a tile's target is a [`rimir/kind`](https://github.com/rimir-cc/tw-kind) instance, the window tile shows the type's icon (with the type name as hover text) before the caption. Degrades silently when kind isn't installed.

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
