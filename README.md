# DraftForgeCAD

A desktop 2D CAD drafting program with a command-line driven workflow: type a command (or its
short alias), answer the prompts with clicks or coordinates, press Enter. It opens **DWG** and
**DXF** drawings and runs on Windows, macOS and Linux.

## Download

Every push builds installers with GitHub Actions (**Actions → Build → Artifacts**):

| Platform | File |
|---|---|
| Windows | `DraftForgeCAD-<version>-setup.exe` (installer) or `DraftForgeCAD-<version>-portable.exe` (no install) |
| macOS | `DraftForgeCAD-<version>-mac-*.dmg` (unsigned: right-click → Open the first time) |
| Linux | `DraftForgeCAD-<version>-linux-x86_64.AppImage` |

Pushing a tag such as `v1.0.0` publishes the same files as a GitHub Release.

Windows SmartScreen may warn that the app is from an unknown publisher, because the build is not
code-signed. Choose **More info → Run anyway**.

## What it does

- **Drawing:** LINE, PLINE (with arc segments), RECTANG, POLYGON, CIRCLE (center/radius, 2P, 3P), ARC (3-point, center/start/end, start/end/radius), ELLIPSE, SPLINE, POINT, XLINE, RAY, HATCH (solid and patterns, with islands)
- **Editing:** MOVE, COPY, ROTATE, SCALE, MIRROR, OFFSET, TRIM, EXTEND, FILLET, CHAMFER, STRETCH, EXPLODE, JOIN, BREAK, ARRAYRECT, ARRAYPOLAR, ERASE, MATCHPROP, grip editing
- **Annotation:** TEXT, MTEXT, DIMLINEAR, DIMALIGNED, DIMRADIUS, DIMDIAMETER, DIMANGULAR
- **Blocks:** BLOCK, INSERT, block references with attributes, nested blocks
- **Precision input:** absolute `x,y`, relative `@dx,dy`, polar `@dist<angle`, direct distance entry, object snaps (endpoint, midpoint, center, quadrant, intersection, perpendicular, tangent, nearest, node, insertion), polar tracking, ortho, grid snap
- **Layouts and plotting:** Model/Layout tabs, paper sizes A4–A0, Letter, Tabloid and ANSI/ARCH, viewports at standard scales (MVIEW, VPSCALE, VPFIT, VPPAN), PLOT to a printer or a vector **PDF** with preview, monochrome/grayscale/colour plot styles and lineweights
- **Title blocks:** TITLEBLOCK inserts an ISO-style frame and title block sized to the paper, with fillable fields (title, drawing no., scale, date, drawn/checked, sheet, revision, project, company); double-click to edit. Build your own with ATTDEF + BLOCK
- **Isometric drafting:** ISODRAFT (status-bar cube icon) gives an isometric grid, snap and crosshair; F5 / Ctrl+E cycles left/top/right planes; ortho (F8) locks to the plane's axes; ELLIPSE → Isocircle
- **Object snap tracking (F11):** pause over a snap point to acquire it (green +), then follow the dotted alignment paths; snaps where two paths cross, where a path meets lines, circles, arcs, ellipses or splines, or where it crosses your ortho/polar direction. Line ends extend straight, arc ends extend round their circle
- **Angle locks:** type `<30` at any point prompt to lock the next point to 30°; SNAPANG rotates the ortho lock and crosshair
- **Organisation:** layers (on/off, freeze, lock, colour, linetype, lineweight), indexed and true colours, linetypes, lineweights, Properties palette
- **Dashed lines:** pick a linetype (Dashed, Hidden, Center, Phantom, Dot, Dashdot) in the Home tab's Properties panel, or type `LT` then `DA` for dashed. With objects selected, the same control or `LT` changes them. `LTSCALE` makes the dashes longer or shorter.
- **Multiple drawings:** every new or opened drawing gets its own file tab with its own undo history and view. Click a tab or press Ctrl+Tab to switch, drag a tab to reorder, × or `CLOSE` to close (asks to save unsaved changes).
- **Discord status:** with Discord running, your profile shows **DraftForgeCAD** and "Working on <drawing name>" (Discord application ID in `package.json`, `discordClientId`; the `DRAFTFORGE_DISCORD_CLIENT_ID` environment variable overrides it). Type `DISCORD` to turn the status off or on.
- **Dimension text:** `DIMDEC` sets the decimal places (default 2). Trailing zeros are hidden like AutoCAD's metric dimensions (50.00 shows as 50, 12.50 as 12.5); `DIMZIN` or the Properties palette switches them back on.
- **Tracking from a point:** pause on a snap point to acquire it (F11), move along the green alignment line and type a distance: it is measured from the acquired point. `FROM` at a point prompt takes a base point, then an offset such as `@20,10` or `@15<30`.
- **Break lines:** `BREAKLINE` (or Home > Draw > Break Line) draws a line with a zigzag break symbol showing the object continues. Pick two points, then the symbol location (Enter = midpoint). The Size and Extension options set the symbol width (default 1/8 of the line) and how far the line runs past the points.
- **Dimension text:** narrow dimensions move arrows and text outside the extension lines automatically. `DIMTEDIT` (Annotate > Edit Text) moves the text of a dimension: drag it, or choose Left / Right (which side, or which end when it fits), Center (always centred, even without room), Home (back to automatic) or Angle. The Properties palette has the same Left / Right / Center choice as "Text position".
- **Reference images:** `IMAGEATTACH` (Insert > Image, or drag a picture onto the window) places a PNG, JPG, GIF, WebP or BMP behind the drawing: pick the lower-left corner, then a width, or Reference to click two points on the picture and type their real distance, then a rotation. Fade it with `IMAGEADJUST` or the Properties palette. Images are saved inside `.dfg` files and appear in plots and SVG exports; DXF files cannot hold them.
- **Groups:** `GROUP` (`G`, Home > Groups) joins objects so picking one selects them all; give it a name or press Enter for an unnamed group. `UNGROUP` breaks a group up, `GROUPEDIT` adds or removes objects or renames it, and Ctrl+Shift+A (`PICKSTYLE`) turns group selection off to pick single members. Copies of a whole group become a new group.
- **Ribbon:** panels show their everyday tools; click a panel title with ▾ for the rest (the pin keeps it open). On wide screens the extra tools appear on the ribbon itself. Insert Block, Measure and Paste are stacked as symbols, each with its own ▾. On narrow windows panels fold into one button that opens the whole panel; Draw and Modify stay open, and the layer and property dropdowns fold last.
- **Text box points:** every text object has its four box corners and exact centre as snap points (Endpoint and Midpoint snaps) and grips, so text can be placed, aligned or moved by any of them.
- **Dimension arrowheads:** Auto (default) uses arrows where they fit and architectural ticks on narrow dimensions; Arrow flips arrows outside instead; Tick uses ticks everywhere. Set it for the drawing with `DIMARROW` or the Properties palette, or per dimension in the palette (Arrowheads).
- **Touchpads:** a two-finger swipe pans the view and a pinch zooms around the pointer; a mouse wheel still zooms in steps (the two are told apart automatically).
- **Section lines:** `SECTIONLINE` (`SL`, Annotate > Section Line) draws a section cutting line with stubs, arrows pointing the way the section is viewed and upright letters (next free letter suggested), plus an optional "SECTION A-A" title; the mark is grouped and sized from the dimension text height.
- **Layer list:** the layer box on the Home tab drops down a list of all layers with clickable on/off, freeze and lock icons (it stays open for several changes); click a name to make it current, or to move selected objects onto it.
- **Isometric "All planes":** besides Left / Top / Right, the isoplane can be All (F5 cycles to it, or `ISODRAFT` → All): the crosshair shows all three iso axes and Ortho locks to whichever is nearest, so all six iso directions work without switching planes. Isocircles then ask which face they are on.
- **Drafting mode per drawing:** isometric mode and its plane, Ortho, Snap, Grid, the snap angle and the snap/grid spacing are remembered by each drawing (and saved in the `.dfg`), like AutoCAD; switching tabs switches them. New drawings start in normal drafting.
- **Interface:** ribbon, command line with autocomplete and history, dynamic input tooltip, window/crossing selection, right-click menus, undo/redo
- **Files:** open DWG (R14 through 2018+), DXF and DraftForgeCAD `.dfg`; save `.dfg` or DXF R12; export SVG, PNG and PDF

Press **F1** in the app for the full command list with aliases. Common keys: F3 object snap,
F7 grid, F8 ortho, F9 snap, F10 polar, Ctrl+1 properties, Enter/Space repeat last command,
mouse wheel zoom, middle-drag pan, middle double-click zoom extents.

### DWG support

DWG files are read with [LibreDWG](https://www.gnu.org/software/libredwg/) (compiled to
WebAssembly via [`@mlightcad/libredwg-web`](https://github.com/mlightcad/libredwg-web)).
Lines, arcs, circles, polylines, ellipses, splines, text, multiline text, hatches, block
references with attributes, dimensions, solids and construction lines are imported. 3D solids,
wipeouts, tables, multileaders, multilines and tolerances are listed in the command line as not
displayed. Saving back to DWG is not supported: use **Save As** to write DXF, which every CAD
program opens, or DraftForgeCAD's own `.dfg` format, which preserves everything.

## Development

```bash
npm install
npm start             # run the app
npm test              # geometry + DWG/DXF import tests
npm run test:e2e      # drives the real Electron app (use xvfb-run on headless Linux)
npm run dist:win      # build Windows .exe (the NSIS installer needs Windows or Wine)
```

Source layout:

| File | Purpose |
|---|---|
| `main.js`, `preload.js` | Electron shell: window, native dialogs, file IO |
| `dwgload.js`, `src/dwgconvert.js` | DWG reading (LibreDWG) and conversion to the drawing model |
| `src/dxf.js` | DXF reader and writer |
| `src/geom.js` | Geometry kernel: intersections, trim/extend/offset/fillet, transforms, splines |
| `src/app.js` | Rendering, snapping, selection, grips, undo, command prompts |
| `src/commands.js` | All drawing and editing commands |
| `src/ui.js` | Ribbon, command line, palettes, dialogs, file handling |
| `src/layout.js` | Layouts, viewports, title blocks, attributes, plotting and PDF |

## License

GPL-3.0-or-later (see `LICENSE`). DraftForgeCAD links LibreDWG, which is GPL-3.0 licensed, so the
application as a whole is distributed under the GPL.

DraftForgeCAD is an independent project and is not affiliated with or endorsed by Autodesk, Inc.
DWG is used here only to describe file compatibility.
