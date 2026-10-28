#!/usr/bin/env python3
"""Generate a one-piece pickleball paddle whose face is an open honeycomb.

The paddle has no face skins: the hitting area is a through-thickness
hexagonal lattice held by a solid rim (edge guard), joined to an octagonal
grip with a flared butt cap.  Everything is a single watertight solid,
exported as binary STL.  All dimensions are in millimetres.

    pip install manifold3d numpy
    python3 generate_paddle.py                      # printable, flat bottom
    python3 generate_paddle.py --grip symmetric     # grip centred on the face
"""

import argparse
import math

import numpy as np
from manifold3d import CrossSection, Manifold, OpType

INCH = 25.4

# Overall size. USA Pickleball: length <= 17 in, length + width <= 24 in.
LENGTH = 400.0             # butt cap to top edge (15.75 in)
WIDTH = 197.0              # 7.75 in
HANDLE_LENGTH = 133.0      # butt cap to bottom edge of the face (5.25 in)

# Face
THICKNESS = 13.0           # core thickness
RIM_WIDTH = 4.5            # solid edge guard around the honeycomb
EDGE_RADIUS = 2.0          # rounding on the outer edge of the rim
TOP_CORNER_R = 38.0
BOTTOM_CORNER_R = 28.0

# Honeycomb (hexagonal cells running straight through the thickness)
CELL_PITCH = 15.0          # centre-to-centre distance across flats
WALL = 1.0                 # wall thickness between cells
MIN_HOLE_WIDTH = 2.5       # clipped cells narrower than this stay solid

# Grip: octagon, about 108 mm (4.25 in) around
GRIP_WIDTH = 36.0
GRIP_DEPTH = 24.0
GRIP_CHAMFER = 5.0
THROAT_TOP_Y = 150.0       # where the grip has blended into the face
THROAT_WIDTH = 64.0

SEGMENTS = 96


def face_outline():
    """Rounded-rectangle outline of the face (convex)."""
    hw = WIDTH / 2
    corners = []
    for sx in (-1, 1):
        corners.append(CrossSection.circle(TOP_CORNER_R, SEGMENTS).translate(
            (sx * (hw - TOP_CORNER_R), LENGTH - TOP_CORNER_R)))
        corners.append(CrossSection.circle(BOTTOM_CORNER_R, SEGMENTS).translate(
            (sx * (hw - BOTTOM_CORNER_R), HANDLE_LENGTH + BOTTOM_CORNER_R)))
    return CrossSection.batch_hull(corners)


def rounded_slab(outline, z0, z1, radius, steps=6):
    """Extrude a convex outline from z0 to z1 with rounded top and bottom edges."""
    pts = []
    for i in range(steps + 1):
        a = (math.pi / 2) * i / steps
        inset = radius * (1 - math.cos(a))
        rise = radius * (1 - math.sin(a))
        ring = np.vstack(outline.offset(-inset).to_polygons())
        for z in (z0 + rise, z1 - rise):
            pts.append(np.column_stack([ring, np.full(len(ring), z)]))
    return Manifold.hull_points(np.vstack(pts))


def hexagon(cx, cy, across_flats):
    """Pointy-top hexagon (flat sides face the paddle's left and right edges)."""
    r = across_flats / math.sqrt(3)
    return CrossSection([[(cx + r * math.cos(math.radians(90 + 60 * k)),
                           cy + r * math.sin(math.radians(90 + 60 * k)))
                          for k in range(6)]])


def honeycomb_holes(region):
    """Hexagonal holes clipped to `region`, centred on the paddle's axis."""
    (x0, y0), (x1, y1) = (lambda b: ((b[0], b[1]), (b[2], b[3])))(region.bounds())
    cy = (y0 + y1) / 2
    row_pitch = CELL_PITCH * math.sqrt(3) / 2
    cells = []
    rows = int((y1 - y0) / row_pitch / 2) + 2
    cols = int((x1 - x0) / CELL_PITCH / 2) + 2
    for j in range(-rows, rows + 1):
        shift = CELL_PITCH / 2 if j % 2 else 0.0
        for i in range(-cols, cols + 1):
            cells.append(hexagon(i * CELL_PITCH + shift, cy + j * row_pitch,
                                 CELL_PITCH - WALL))
    clipped = CrossSection.compose(cells) ^ region
    # Drop slivers left where cells are cut by the rim; they print badly.
    keep = [p for p in clipped.decompose()
            if not p.offset(-MIN_HOLE_WIDTH / 2).is_empty()]
    return CrossSection.compose(keep)


def octagon_ring(y, width, depth, chamfer, zc):
    hw, hd, c = width / 2, depth / 2, chamfer
    xz = [(hw, hd - c), (hw - c, hd), (-hw + c, hd), (-hw, hd - c),
          (-hw, -hd + c), (-hw + c, -hd), (hw - c, -hd), (hw, -hd + c)]
    return [(x, y, zc + z) for x, z in xz]


def handle(flat_bottom):
    """Butt cap, grip and throat, as a union of convex hulls of octagon rings."""
    def ring(y, w, d, c):
        zc = d / 2 if flat_bottom else 0.0
        return octagon_ring(y, w, d, c, zc)

    g = (GRIP_WIDTH, GRIP_DEPTH, GRIP_CHAMFER)
    cap = (GRIP_WIDTH + 5, GRIP_DEPTH + 4.5, GRIP_CHAMFER + 1.5)
    stations = [
        [ring(0, GRIP_WIDTH + 2, GRIP_DEPTH + 2, GRIP_CHAMFER + 2),
         ring(3, *cap), ring(9, *cap)],                          # butt cap
        [ring(9, *cap), ring(17, *g)],                            # cap taper
        [ring(17, *g), ring(HANDLE_LENGTH - 15, *g)],             # grip
        [ring(HANDLE_LENGTH - 15, *g),
         ring(THROAT_TOP_Y, THROAT_WIDTH, THICKNESS, 2.0)],       # throat
    ]
    return Manifold.batch_boolean(
        [Manifold.hull_points(np.vstack(s)) for s in stations],
        OpType.Add)


def throat_footprint():
    y = HANDLE_LENGTH - 15
    return CrossSection.hull_points(np.array([
        (-GRIP_WIDTH / 2, y), (GRIP_WIDTH / 2, y),
        (-THROAT_WIDTH / 2, THROAT_TOP_Y), (THROAT_WIDTH / 2, THROAT_TOP_Y)]))


def build(flat_bottom=True):
    z0 = 0.0 if flat_bottom else -THICKNESS / 2
    outline = face_outline()
    slab = rounded_slab(outline, z0, z0 + THICKNESS, EDGE_RADIUS)

    region = outline.offset(-RIM_WIDTH) - throat_footprint().offset(RIM_WIDTH)
    holes = Manifold.extrude(honeycomb_holes(region), THICKNESS + 2).translate(
        (0, 0, z0 - 1))
    return (slab - holes) + handle(flat_bottom)


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


def min_square_bed(solid):
    """Smallest square bed the footprint fits on, trying every rotation."""
    pts = np.asarray(solid.to_mesh().vert_properties)[:, :2]
    best = (float("inf"), 0)
    for deg in range(0, 180):
        a = math.radians(deg)
        rot = pts @ np.array([[math.cos(a), -math.sin(a)],
                              [math.sin(a), math.cos(a)]])
        side = max(np.ptp(rot[:, 0]), np.ptp(rot[:, 1]))
        best = min(best, (side, deg))
    return best


def report(solid, density=1.25, handle_fill=0.35):
    (x0, y0, z0, x1, y1, z1) = solid.bounding_box()
    big = 1000.0
    grip = solid ^ Manifold.cube((big, HANDLE_LENGTH, big)).translate(
        (-big / 2, 0, -big / 2))
    face_cm3 = (solid.volume() - grip.volume()) / 1000
    grip_cm3 = grip.volume() / 1000
    mass = density * (face_cm3 + handle_fill * grip_cm3)
    side, deg = min_square_bed(solid)
    print(f"  size        : {x1 - x0:.1f} x {y1 - y0:.1f} x {z1 - z0:.1f} mm")
    print(f"  length+width: {(LENGTH + WIDTH) / INCH:.2f} in (limit 24 in)")
    print(f"  volume      : face {face_cm3:.0f} cm3, handle {grip_cm3:.0f} cm3")
    print(f"  est. mass   : {mass:.0f} g ({mass / 28.35:.1f} oz) "
          f"@ {density} g/cm3, handle {handle_fill:.0%} filled")
    print(f"  square bed  : >= {side:.0f} mm (rotated {deg} deg)")


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--grip", choices=["flat", "symmetric"], default="flat",
                    help="flat: grip flush with the face's underside, prints "
                         "without supports; symmetric: grip centred on the face")
    ap.add_argument("-o", "--output")
    args = ap.parse_args()

    out = args.output or ("pickleball_paddle.stl" if args.grip == "flat"
                          else "pickleball_paddle_symmetric.stl")
    solid = build(flat_bottom=args.grip == "flat")
    tris = write_stl(solid, out)
    print(f"{out}: {tris} triangles, genus {solid.genus()}")
    report(solid)


if __name__ == "__main__":
    main()
