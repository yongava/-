#!/usr/bin/env python3
"""Generate a one-piece pickleball paddle whose face is an open honeycomb.

The paddle has no face skins: the hitting area is a through-thickness
hexagonal lattice held by a solid rim (edge guard), joined to an octagonal
grip with a flared butt cap.  Everything is a single watertight solid,
exported as binary STL.  All dimensions are in millimetres.

    pip install manifold3d numpy shapely
    python3 generate_paddle.py --shape elongated        # grip centred on the face
    python3 generate_paddle.py --shape hybrid --grip flat
    python3 generate_paddle.py --all                    # every shape
    python3 generate_paddle.py --all --pattern diamond --wall 1.0 --side-pad 8
"""

import argparse
import math
import os

import numpy as np
from manifold3d import CrossSection, Manifold, OpType
from shapely.geometry import LineString
from shapely.geometry import box as shapely_box
from shapely.geometry.polygon import orient
from shapely.ops import polygonize, unary_union

INCH = 25.4

HANDLE_LENGTH = 6.0 * INCH  # butt cap to the neck, where the face starts

# Head shapes, sized after current production paddles.  USA Pickleball allows
# length <= 17 in and length + width <= 24 in; hybrid and elongated shapes sit
# just under that 24 in total, so a longer handle shortens the face.
#
# The outline is the hull of the top corner circles (`top_r`), the shoulder
# circles (`shoulder_r`, centred at `shoulder_y`) and a narrow tip at `v_y`,
# so the lower face tapers in a V.  A neck `neck_hw` wide (half-width) joins
# that V to the handle through concave fillets of radius `fillet`.  `handle`
# runs from the butt cap to the neck; the taper is placed from the neck so it
# keeps its shape whatever the handle length.  `side_pad` widens the rim at
# 3 and 9 o'clock (perimeter weighting); it brings each shape to about 224 g.
SHAPES = {
    # Classic shape, e.g. Selkirk Epic 15.75 x 8 in.
    "standard": dict(length=400.0, width=197.0, handle=HANDLE_LENGTH,
                     top_r=52.0, shoulder_y=HANDLE_LENGTH + 75.0,
                     shoulder_r=52.0, v_y=HANDLE_LENGTH + 2.0, v_hw=10.0,
                     neck_hw=20.0, fillet=36.0, side_pad=7.0),
    # e.g. RPM Q2 Hybrid Flat Top 16.25 x 7.7 in.
    "hybrid": dict(length=412.5, width=195.5, handle=HANDLE_LENGTH,
                   top_r=62.0, shoulder_y=HANDLE_LENGTH + 85.0,
                   shoulder_r=55.0, v_y=HANDLE_LENGTH + 2.0, v_hw=10.0,
                   neck_hw=20.0, fillet=38.0, side_pad=7.0),
    # Corners and taper fitted to a photo of a JOOLA Perseus (0.9 mm RMS);
    # compare RPM Friction Pro Elongated 16.5 x 7.5 in and Selkirk Invikta
    # 16.5 x 7.375 in.
    "elongated": dict(length=419.0, width=190.0, handle=HANDLE_LENGTH,
                      top_r=70.0, shoulder_y=HANDLE_LENGTH + 91.0,
                      shoulder_r=55.0, v_y=HANDLE_LENGTH + 2.0, v_hw=10.0,
                      neck_hw=20.0, fillet=38.0, side_pad=11.0),
}

# Face
THICKNESS = 13.0           # core thickness
RIM_WIDTH = 4.5            # solid edge guard around the lattice
EDGE_RADIUS = 2.0          # rounding on the outer edge of the rim

# Lattice (open cells running straight through the thickness).  A light
# lattice in a heavy frame gives the biggest sweet spot (see
# analyze_paddle.py): thin walls inside, solid pads at 3 and 9 o'clock.
CELL_PITCH = 15.0          # honeycomb centre-to-centre distance across flats
WALL = 0.8                 # wall thickness between cells: two 0.4 mm lines
MIN_HOLE_WIDTH = 2.5       # clipped cells narrower than this stay solid
RIB_DENSITY = 2 / CELL_PITCH  # rib length per face area (1/mm); sets weight
PATTERNS = ("honeycomb", "square", "diamond", "triangle", "octagon")
PAD_RAMP = 20.0            # side pads ease in and out over this length

# Grip: octagon, about 108 mm (4.25 in) around
GRIP_WIDTH = 36.0
GRIP_DEPTH = 24.0
GRIP_CHAMFER = 5.0
THROAT_START = 15.0        # grip starts blending this far below the face
THROAT_REACH = 22.0        # ...and has fully blended this far into it
THROAT_WIDTH = 64.0        # blend width there, if the neck is wide enough
THROAT_STEPS = 12          # rings in the blend's loft
THROAT_CLEARANCE = EDGE_RADIUS + 0.5  # blend stays clear of the rounded edge
GRIP_FILLET = 12.0         # top-view fillet where the grip meets the neck
COLLAR_BELOW = 8.0         # collar band covering the grip-to-neck step runs
COLLAR_ABOVE = 2.0         # from this far below the face to this far into it
COLLAR_PROUD = 0.5         # and stands this far proud of what it wraps

SEGMENTS = 96


def face_outline(shape):
    """Face outline: rounded head, V taper, and filleted neck down to the handle."""
    s = shape
    hw = s["width"] / 2
    parts = []
    for sx in (-1, 1):
        parts.append(CrossSection.circle(s["top_r"], SEGMENTS).translate(
            (sx * (hw - s["top_r"]), s["length"] - s["top_r"])))
        parts.append(CrossSection.circle(s["shoulder_r"], SEGMENTS).translate(
            (sx * (hw - s["shoulder_r"]), s["shoulder_y"])))
        parts.append(CrossSection.circle(1.0, 16).translate(
            (sx * (s["v_hw"] - 1), s["v_y"])))
    head = CrossSection.batch_hull(parts)
    neck = CrossSection.square(
        (2 * s["neck_hw"], s["v_y"] - s["handle"] + 30)).translate(
        (-s["neck_hw"], s["handle"] - 20))
    # Closing (grow, then shrink) fillets the concave corners at the neck.
    shape2d = (head + neck).offset(s["fillet"]).offset(-s["fillet"])
    keep = CrossSection.square((1000, s["length"])).translate(
        (-500, s["handle"]))
    return (shape2d ^ keep).simplify(0.02)


def throat_plan(shape, outline):
    """Top view the grip-to-face blend may fill: grip plus face, filleted.

    The face part is pulled in by THROAT_CLEARANCE so the blend's cut sides
    stay on the face's flat zone; cutting through the rounded edge leaves
    zero-area slivers that break the STL.
    """
    grip = CrossSection.square((GRIP_WIDTH, shape["handle"] + 1)).translate(
        (-GRIP_WIDTH / 2, 0))
    face = outline.offset(-THROAT_CLEARANCE)
    return (face + grip).offset(GRIP_FILLET).offset(-GRIP_FILLET)


def rounded_slab(outline, z0, z1, radius):
    """Extrude an outline from z0 to z1 with rounded top and bottom edges."""
    core = Manifold.extrude(outline.offset(-radius), z1 - z0 - 2 * radius)
    slab = core.translate((0, 0, z0 + radius)).minkowski_sum(
        Manifold.sphere(radius, 12))
    # The Minkowski sum leaves coincident vertices and zero-area slivers that
    # break the STL once vertices are merged; collapse them.
    return slab.simplify(0.01)


def pattern_lines(pattern, box, cy, density=RIB_DENSITY):
    """Rib centre-lines of `pattern` covering `box`, symmetric about x = 0.

    Every pattern lays the same rib length per unit area (`density`), so at
    equal wall thickness they weigh the same.
    """
    x0, y0, x1, y1 = box
    reach = math.hypot(x1 - x0, y1 - y0)
    c0 = np.array([0.0, cy])

    def family(angle, spacing):
        d = np.array([math.cos(math.radians(angle)), math.sin(math.radians(angle))])
        n = np.array([-d[1], d[0]])
        count = int(reach / spacing) + 2
        return [LineString([c0 + k * spacing * n - reach * d,
                            c0 + k * spacing * n + reach * d])
                for k in range(-count, count + 1)]

    if pattern == "honeycomb":
        # Pointy-top cells, flat sides facing the paddle's edges.
        p = 2 / density
        r = p / math.sqrt(3)
        rows = int(reach / (p * math.sqrt(3) / 2)) + 2
        cols = int(reach / p) + 2
        ring = [(r * math.cos(math.radians(90 + 60 * k)),
                 r * math.sin(math.radians(90 + 60 * k))) for k in range(7)]
        lines = []
        for j in range(-rows, rows + 1):
            for i in range(-cols, cols + 1):
                cx = i * p + (p / 2 if j % 2 else 0.0)
                cyy = cy + j * p * math.sqrt(3) / 2
                lines.append(LineString([(cx + u, cyy + v) for u, v in ring]))
        return lines
    if pattern == "octagon":
        # Octagons can't tile on their own: they share flat sides and leave
        # small squares in the gaps (the truncated square tiling).
        a = 6 / ((3 + 2 * math.sqrt(2)) * density)        # side length
        p = a * (1 + math.sqrt(2))                        # octagon pitch
        r = a / (2 * math.sin(math.pi / 8))
        count = int(reach / p) + 2
        ring = [(r * math.cos(math.radians(22.5 + 45 * k)),
                 r * math.sin(math.radians(22.5 + 45 * k))) for k in range(9)]
        return [LineString([(i * p + u, cy + j * p + v) for u, v in ring])
                for j in range(-count, count + 1) for i in range(-count, count + 1)]
    if pattern == "square":
        return family(0, 2 / density) + family(90, 2 / density)
    if pattern == "diamond":
        return family(45, 2 / density) + family(-45, 2 / density)
    if pattern == "triangle":
        # One rib family runs along the paddle, the others at +-60 degrees.
        h = 3 / density
        return family(90, h) + family(30, h) + family(-30, h)
    raise ValueError(f"unknown pattern {pattern!r}")


def uniform_wall(x, y):
    return WALL


def lattice(region, pattern="honeycomb", wall=uniform_wall):
    """Holes and rib centre-line segments for `pattern` inside `region`.

    Holes are the faces of the rib network, each pulled in by half the wall
    thickness at its centre, so `wall(x, y)` can grade the walls across the
    face.  Returns the holes (a CrossSection) and the noded rib segments as
    an (n, 2, 2) array of end points with an (n,) array of thicknesses.
    """
    x0, y0, x1, y1 = region.bounds()
    margin = 40.0
    box = (x0 - margin, y0 - margin, x1 + margin, y1 + margin)
    noded = unary_union(pattern_lines(pattern, box, (y0 + y1) / 2)).intersection(
        shapely_box(*box))
    contours = []
    for face in polygonize(noded):
        c = face.centroid
        hole = face.buffer(-wall(c.x, c.y) / 2, join_style="mitre")
        if not hole.is_empty and hole.geom_type == "Polygon":
            contours.append(np.asarray(orient(hole, 1.0).exterior.coords)[:-1])
    holes = CrossSection(contours) ^ region
    # Drop slivers left where cells are cut by the rim; they print badly.
    keep = [p for p in holes.decompose()
            if not p.offset(-MIN_HOLE_WIDTH / 2).is_empty()]

    segments = []
    for line in getattr(noded, "geoms", [noded]):
        pts = np.asarray(line.coords)
        segments += [pts[i:i + 2] for i in range(len(pts) - 1)]
    segments = np.array(segments)
    mid = segments.mean(axis=1)
    return (CrossSection.compose(keep), segments,
            np.array([wall(x, y) for x, y in mid]))


def octagon_ring(y, width, depth, chamfer, zc):
    hw, hd, c = width / 2, depth / 2, chamfer
    xz = [(hw, hd - c), (hw - c, hd), (-hw + c, hd), (-hw, hd - c),
          (-hw, -hd + c), (-hw + c, -hd), (hw - c, -hd), (hw, -hd + c)]
    return [(x, y, zc + z) for x, z in xz]


def width_at(region, y):
    x0, _, x1, _ = (region ^ CrossSection.square((1000, 0.2)).translate(
        (-500, y - 0.1))).bounds()
    return x1 - x0


def handle(shape, flat_bottom, outline, plan):
    """Butt cap, grip, throat and collar, as a union of convex hulls of octagon rings.

    The throat (grip-to-face blend) is lofted through rings no wider than
    `plan`, so it follows the curved neck instead of sticking out past it.
    The neck is wider than the grip where the face starts; a collar band
    wraps that step, as on production paddles.
    """
    def ring(y, w, d, c):
        zc = d / 2 if flat_bottom else 0.0
        return octagon_ring(y, w, d, c, zc)

    grip_end = shape["handle"] - THROAT_START
    throat_end = shape["handle"] + THROAT_REACH

    def throat_dims(y):
        t = (y - grip_end) / (throat_end - grip_end)
        ease = (1 - math.cos(math.pi * t)) / 2
        return (min(GRIP_WIDTH + (THROAT_WIDTH - GRIP_WIDTH) * t,
                    width_at(plan, y)),
                GRIP_DEPTH + (THICKNESS - GRIP_DEPTH) * ease,
                GRIP_CHAMFER + (2.0 - GRIP_CHAMFER) * ease)

    g = (GRIP_WIDTH, GRIP_DEPTH, GRIP_CHAMFER)
    cap = (GRIP_WIDTH + 5, GRIP_DEPTH + 4.5, GRIP_CHAMFER + 1.5)
    stations = [
        [ring(0, GRIP_WIDTH + 2, GRIP_DEPTH + 2, GRIP_CHAMFER + 2),
         ring(3, *cap), ring(9, *cap)],                          # butt cap
        [ring(9, *cap), ring(17, *g)],                            # cap taper
        [ring(17, *g), ring(grip_end, *g)],                       # grip
    ]
    throat = [ring(y, *throat_dims(y))
              for y in np.linspace(grip_end, throat_end, THROAT_STEPS + 1)]
    stations += [[a, b] for a, b in zip(throat, throat[1:])]

    # The collar strictly contains the grip, throat and face where it sits,
    # so its surfaces never touch theirs.
    y0 = shape["handle"] - COLLAR_BELOW
    y1 = shape["handle"] + COLLAR_ABOVE
    width = width_at(outline, y1) + 2 * COLLAR_PROUD
    stations.append([ring(y, width, throat_dims(y)[1] + 2 * COLLAR_PROUD, 2.0)
                     for y in (y0, y1)])
    return Manifold.batch_boolean(
        [Manifold.hull_points(np.vstack(s)) for s in stations], OpType.Add)


def throat_footprint(shape, plan):
    y0 = shape["handle"] - THROAT_START
    y1 = shape["handle"] + THROAT_REACH
    return plan ^ CrossSection.hull_points(np.array([
        (-GRIP_WIDTH / 2, y0), (GRIP_WIDTH / 2, y0),
        (-THROAT_WIDTH / 2, y1), (THROAT_WIDTH / 2, y1)]))


def side_pads(shape, width):
    """Lattice limit that widens the rim by up to `width` along the straight
    sides (3 and 9 o'clock), easing in and out over PAD_RAMP."""
    s = shape
    y0 = s["shoulder_y"]                       # sides run straight from here
    y1 = s["length"] - s["top_r"]              # ...to the top corners
    ys = np.linspace(y0, y1, 60)
    t = np.clip(np.minimum(ys - y0, y1 - ys) / PAD_RAMP, 0, 1)
    pad = width * (3 * t**2 - 2 * t**3)
    x = s["width"] / 2 - RIM_WIDTH - pad
    pts = ([(500.0, -500.0), (500.0, y0)] + [(xi, yi) for xi, yi in zip(x, ys)]
           + [(500.0, y1), (500.0, 2000.0), (-500.0, 2000.0), (-500.0, y1)]
           + [(-xi, yi) for xi, yi in zip(x[::-1], ys[::-1])]
           + [(-500.0, y0), (-500.0, -500.0)])
    return CrossSection([pts])


def face_regions(shape, side_pad=None):
    """Outline, throat plan, lattice region and the solid area at the throat."""
    if side_pad is None:
        side_pad = shape["side_pad"]
    outline = face_outline(shape)
    plan = throat_plan(shape, outline)
    throat_solid = throat_footprint(shape, plan).offset(RIM_WIDTH) ^ outline
    region = outline.offset(-RIM_WIDTH) - throat_solid
    if side_pad > 0:
        region = region ^ side_pads(shape, side_pad)
    return outline, plan, region, throat_solid


def build(shape, flat_bottom=True, pattern="honeycomb", wall=uniform_wall,
          side_pad=None):
    z0 = 0.0 if flat_bottom else -THICKNESS / 2
    outline, plan, region, _ = face_regions(shape, side_pad)
    slab = rounded_slab(outline, z0, z0 + THICKNESS, EDGE_RADIUS)
    holes = Manifold.extrude(lattice(region, pattern, wall)[0],
                             THICKNESS + 2).translate((0, 0, z0 - 1))
    return (slab - holes) + handle(shape, flat_bottom, outline, plan)


def write_stl(solid, path):
    mesh = solid.to_mesh()
    verts = np.asarray(mesh.vert_properties)[:, :3].astype(np.float32)
    tris = verts[np.asarray(mesh.tri_verts)]
    normals = np.cross(tris[:, 1] - tris[:, 0], tris[:, 2] - tris[:, 0])
    normals /= np.maximum(np.linalg.norm(normals, axis=1, keepdims=True), 1e-12)
    record = np.dtype([("normal", "<f4", 3), ("verts", "<f4", (3, 3)),
                       ("attr", "<u2")])
    data = np.zeros(len(tris), dtype=record)
    data["normal"], data["verts"] = normals, tris
    with open(path, "wb") as f:
        f.write(b"one-piece honeycomb pickleball paddle".ljust(80, b" "))
        f.write(np.uint32(len(tris)).tobytes())
        f.write(data.tobytes())
    return len(tris)


def min_square_bed(solid, axes=(0, 1)):
    """Smallest square bed the footprint on `axes` fits, trying every rotation."""
    pts = np.asarray(solid.to_mesh().vert_properties)[:, list(axes)]
    best = (float("inf"), 0)
    for deg in range(0, 180):
        a = math.radians(deg)
        rot = pts @ np.array([[math.cos(a), -math.sin(a)],
                              [math.sin(a), math.cos(a)]])
        side = max(np.ptp(rot[:, 0]), np.ptp(rot[:, 1]))
        best = min(best, (side, deg))
    return best


def centroid_y(solid):
    """Y of the volume centroid, summed over tetrahedra fanned from the origin."""
    mesh = solid.to_mesh()
    v = np.asarray(mesh.vert_properties)[:, :3].astype(np.float64)
    t = np.asarray(mesh.tri_verts)
    a, b, c = v[t[:, 0]], v[t[:, 1]], v[t[:, 2]]
    vol = np.einsum("ij,ij->i", a, np.cross(b, c)) / 6
    return float((vol * (a[:, 1] + b[:, 1] + c[:, 1]) / 4).sum() / vol.sum())


def stats(solid, shape, on_edge, density=1.25, handle_fill=0.35):
    """Key figures; mass assumes a solid face and a partly filled handle.

    `on_edge`: the paddle prints standing on its long side edge (centred
    grip) rather than lying flat, so the bed holds its length x thickness.
    """
    x0, y0, z0, x1, y1, z1 = solid.bounding_box()
    big = 1000.0
    grip = solid ^ Manifold.cube((big, shape["handle"], big)).translate(
        (-big / 2, 0, -big / 2))
    face = solid - grip
    face_cm3 = face.volume() / 1000
    grip_cm3 = grip.volume() / 1000
    face_g = density * face_cm3
    grip_g = density * handle_fill * grip_cm3
    mass = face_g + grip_g
    balance = (face_g * centroid_y(face) + grip_g * centroid_y(grip)) / mass
    bed, bed_deg = min_square_bed(solid, (1, 2) if on_edge else (0, 1))
    print_height = (x1 - x0) if on_edge else (z1 - z0)
    return dict(
        size=(x1 - x0, y1 - y0, z1 - z0),
        length_in=shape["length"] / INCH, width_in=shape["width"] / INCH,
        handle_in=shape["handle"] / INCH,
        total_in=(shape["length"] + shape["width"]) / INCH,
        cells=solid.genus(), face_cm3=face_cm3, grip_cm3=grip_cm3,
        mass_g=mass, mass_oz=mass / 28.3495, balance_mm=balance,
        bed=bed, bed_deg=bed_deg, on_edge=on_edge, print_height=print_height,
        density=density, handle_fill=handle_fill)


def report(st):
    print(f"  size        : {st['size'][0]:.1f} x {st['size'][1]:.1f} x "
          f"{st['size'][2]:.1f} mm")
    print(f"  inches      : {st['length_in']:.2f} x {st['width_in']:.2f} in, "
          f"handle {st['handle_in']:.2f} in")
    print(f"  length+width: {st['total_in']:.2f} in (limit 24 in)")
    print(f"  lattice     : {st['cells']} cells")
    print(f"  volume      : face {st['face_cm3']:.0f} cm3, "
          f"handle {st['grip_cm3']:.0f} cm3")
    print(f"  est. mass   : {st['mass_g']:.0f} g ({st['mass_oz']:.1f} oz) "
          f"@ {st['density']} g/cm3, handle {st['handle_fill']:.0%} filled")
    print(f"  balance     : {st['balance_mm']:.0f} mm "
          f"({st['balance_mm'] / INCH:.2f} in) from the butt")
    pose = "on its edge" if st["on_edge"] else "flat"
    print(f"  print       : {pose}, square bed >= {st['bed']:.0f} mm "
          f"(rotated {st['bed_deg']} deg), {st['print_height']:.0f} mm tall")


def output_name(shape_name, grip, pattern):
    suffix = ("" if pattern == "honeycomb" else f"_{pattern}") + (
        "_flat" if grip == "flat" else "")
    return os.path.join("stl", f"pickleball_paddle_{shape_name}{suffix}.stl")


def main():
    global WALL
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--shape", choices=list(SHAPES), default="elongated")
    ap.add_argument("--grip", choices=["centered", "flat"], default="centered",
                    help="centered: face sits in the middle of the grip, print "
                         "on its edge; flat: grip flush with the face's "
                         "underside, prints flat without supports")
    ap.add_argument("--pattern", choices=PATTERNS, default="honeycomb")
    ap.add_argument("--wall", type=float, default=WALL,
                    help="lattice wall thickness (mm)")
    ap.add_argument("--side-pad", type=float,
                    help="extra rim width (mm) along the straight sides; "
                         "defaults to the shape's own")
    ap.add_argument("--all", action="store_true", help="write every shape")
    ap.add_argument("-o", "--output")
    args = ap.parse_args()
    WALL = args.wall

    for shape_name in SHAPES if args.all else [args.shape]:
        out = (args.output if args.output and not args.all
               else output_name(shape_name, args.grip, args.pattern))
        os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
        shape = SHAPES[shape_name]
        flat = args.grip == "flat"
        solid = build(shape, flat_bottom=flat, pattern=args.pattern,
                      side_pad=args.side_pad)
        tris = write_stl(solid, out)
        print(f"{out}: {tris} triangles")
        report(stats(solid, shape, on_edge=not flat))


if __name__ == "__main__":
    main()
