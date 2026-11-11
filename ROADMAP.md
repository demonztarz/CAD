# DraftForgeCAD – possible features

Ideas that have been discussed but not built yet. Nothing here is scheduled; pick from it when
planning a version. Newest discussions are at the top of each section.

## Navigation and input

- **Hold-to-pan for touchpads** – hold Space (or Ctrl) and drag to move the view, as a stand-in for
  middle-button dragging. A quick tap of Space would still act as Enter.
- **Live Pan tool** – make the Pan button / `P` work like AutoCAD's: click-drag repeatedly, Esc or
  Enter to finish (today `PAN` takes two points).
- **Touchpad / Mouse switch** – a status-bar toggle and `TOUCHPAD` command, for the rare mouse with a
  free-spinning or smooth wheel that gets mistaken for a touchpad (its wheel would pan instead of zoom).
- **Dynamic input extras** – `#` prefix for absolute coordinates, and typing a comma in the X field
  jumping to the Y field, as in AutoCAD.

## Isometric drafting

- **Isometric axis indicator** – in isometric mode, show the three iso axes in the corner icon,
  labelled X (30°), Y (150°) and Z (up), instead of the flat X/Y icon. A visual aid only; the
  drawing stays 2D.
- **Iso-style coordinate entry** – type three distances (e.g. `#iso 50,30,20`) to place a point 50
  along X, 30 along Y and 20 up Z, converted to the flat position. Handy for boxes from real
  dimensions; a bigger change than the indicator.

## Snap mode (F9)

- **Make it obvious** – a short "Snap on (10 units)" note near the cursor when it turns on, and a more
  noticeable status-bar button.
- **Quick spacing** – a `SNAP` command to type the spacing (e.g. `SNAP` then `1`), or spacing that
  follows the zoom level.
- **PolarSnap** – with polar tracking active, snap the distance along the tracking line to whole steps
  instead of snapping to the grid first and then forcing an angle.

## Groups

- **Group Manager** – a list of every group in the drawing, to select, rename or ungroup them.
- **Nested groups** – let an object belong to more than one group (today grouping already-grouped
  objects moves them into the new group).

## Dimensions

- **Fitting and `DIMTEDIT` for radius, diameter and angular dimensions** – today only straight
  (horizontal, vertical, aligned) dimensions get automatic fitting and text placement.
- **`DIMJOGLINE`** – the zigzag on a dimension line showing it is not drawn to scale.
- *Considered and declined:* ticks chosen by looking at neighbouring dimensions (ticks on whole
  chains automatically). Dimensions stay self-contained to avoid cross-object glitches; set a chain
  to Tick in the Properties palette instead.

## Linetypes

- **Per-object linetype scale** – a Linetype scale field on selected objects that multiplies `LTSCALE`.
- **Custom linetypes** – enter your own dash and gap lengths (e.g. 10, -2) and save them as a named
  linetype in the dropdown.

## Text

- **Box that hugs every letter** – an option for the text snap points/grips to follow descenders
  (g, y, p) and short lowercase text, instead of the fixed baseline-to-capital-height box.

## Modify

- **BREAK and EXTEND for ellipses** – cut a gap out of an ellipse or elliptical arc, and lengthen an
  elliptical arc to a boundary (TRIM already handles ellipses; these can reuse its crossing finder).
- **Break at Point** – split a line into two pieces at one point without removing anything, plus a
  Break button on the ribbon.

## Ribbon

- **Staged shrinking** – on narrow windows, turn big buttons into small labelled ones, then icons
  only, before folding a panel into a single button (AutoCAD-style).
- **Minimise the ribbon** – double-click a tab to shrink the ribbon to tab names, panel titles or
  panel buttons.

## Discord

- **Logo next to the status** – upload `build/icon.png` in the Discord Developer Portal under
  Rich Presence → Art Assets (e.g. named `logo`) and set `discordLargeImage` to that name.
