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
- **Multiple drawings:** every new or opened drawing gets its own file tab with its own undo history and view. Click a tab or press Ctrl+Tab to switch, × or `CLOSE` to close (asks to save unsaved changes).
- **Discord status:** with Discord running, your profile shows **DraftForgeCAD** and "Working on <drawing name>". It needs a Discord application ID in `package.json` (`discordClientId`) or the `DRAFTFORGE_DISCORD_CLIENT_ID` environment variable. Type `DISCORD` to turn the status off or on.
- **Dimension text:** `DIMDEC` sets the decimal places (default 2). Trailing zeros are hidden like AutoCAD's metric dimensions (50.00 shows as 50, 12.50 as 12.5); `DIMZIN` or the Properties palette switches them back on.
- **Tracking from a point:** pause on a snap point to acquire it (F11), move along the green alignment line and type a distance: it is measured from the acquired point. `FROM` at a point prompt takes a base point, then an offset such as `@20,10` or `@15<30`.
- **Break lines:** `BREAKLINE` (or Home > Draw > Break Line) draws a line with a zigzag break symbol showing the object continues. Pick two points, then the symbol location (Enter = midpoint). The Size and Extension options set the symbol width (default 1/8 of the line) and how far the line runs past the points.
- **Dimension text:** narrow dimensions move arrows and text outside the extension lines automatically. `DIMTEDIT` (Annotate > Edit Text) moves the text of a dimension: drag it, or choose Left / Right (which side, or which end when it fits), Center, Home (back to automatic) or Angle. The Properties palette has the same Left / Right / Center choice as "Text position".
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
