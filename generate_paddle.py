#!/usr/bin/env python3
"""Generate a one-piece pickleball paddle whose face is an open honeycomb.

The paddle has no face skins: the hitting area is a through-thickness
hexagonal lattice held by a solid rim (edge guard), joined to an octagonal
grip with a flared butt cap.  Everything is a single watertight solid,
exported as binary STL.  All dimensions are in millimetres.

    pip install manifold3d numpy
    python3 generate_paddle.py --shape elongated            # flat bottom
    python3 generate_paddle.py --shape hybrid --grip symmetric
    python3 generate_paddle.py --all                        # every variant
"""

import argparse
import math
import os

import numpy as np
from manifold3d import CrossSection, Manifold, OpType

INCH = 25.4

# Head shapes, sized after current production paddles.  USA Pickleball allows
# length <= 17 in and length + width <= 24 in; hybrid and elongated shapes sit
# just under that 24 in total.  `handle` runs from the butt cap to the bottom
# edge of the face; `bottom_width` < `width` tapers the face toward the throat.
SHAPES = {
    # Classic shape, e.g. Selkirk Epic 15.75 x 8 in, 5.25 in handle.
    "standard": dict(length=400.0, width=197.0, handle=133.0,
                     top_r=38.0, bottom_r=28.0, bottom_width=197.0),
    # e.g. RPM Q2 Hybrid Flat Top 16.25 x 7.7 in, 5.5 in handle.
    "hybrid": dict(length=412.5, width=195.5, handle=140.0,
                   top_r=42.0, bottom_r=30.0, bottom_width=185.0),
    # e.g. JOOLA Perseus / Hyperion and RPM Friction Pro Elongated
    # 16.5 x 7.5 in, 5.5 in handle; Selkirk Invikta 16.5 x 7.375 in.
    "elongated": dict(length=419.0, width=190.0, handle=140.0,
                      top_r=30.0, bottom_r=24.0, bottom_width=178.0),
}

# Face
THICKNESS = 13.0           # core thickness
RIM_WIDTH = 4.5            # solid edge guard around the honeycomb
EDGE_RADIUS = 2.0          # rounding on the outer edge of the rim

# Honeycomb (hexagonal cells running straight through the thickness)
CELL_PITCH = 15.0          # centre-to-centre distance across flats
WALL = 1.0                 # wall thickness between cells
MIN_HOLE_WIDTH = 2.5       # clipped cells narrower than this stay solid

# Grip: octagon, about 108 mm (4.25 in) around
GRIP_WIDTH = 36.0
GRIP_DEPTH = 24.0
GRIP_CHAMFER = 5.0
THROAT_START = 15.0        # grip starts blending this far below the face
THROAT_REACH = 17.0        # ...and has fully blended this far into it
THROAT_WIDTH = 64.0

SEGMENTS = 96


def face_outline(shape):
    """Convex outline of the face: hull of the four corner circles."""
    s = shape
    corners = []
    for sx in (-1, 1):
        corners.append(CrossSection.circle(s["top_r"], SEGMENTS).translate(
            (sx * (s["width"] / 2 - s["top_r"]), s["length"] - s["top_r"])))
        corners.append(CrossSection.circle(s["bottom_r"], SEGMENTS).translate(
            (sx * (s["bottom_width"] / 2 - s["bottom_r"]),
             s["handle"] + s["bottom_r"])))
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
    x0, y0, x1, y1 = region.bounds()
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


def handle(shape, flat_bottom):
    """Butt cap, grip and throat, as a union of convex hulls of octagon rings."""
    def ring(y, w, d, c):
        zc = d / 2 if flat_bottom else 0.0
        return octagon_ring(y, w, d, c, zc)

    g = (GRIP_WIDTH, GRIP_DEPTH, GRIP_CHAMFER)
    cap = (GRIP_WIDTH + 5, GRIP_DEPTH + 4.5, GRIP_CHAMFER + 1.5)
    grip_end = shape["handle"] - THROAT_START
    stations = [
        [ring(0, GRIP_WIDTH + 2, GRIP_DEPTH + 2, GRIP_CHAMFER + 2),
         ring(3, *cap), ring(9, *cap)],                          # butt cap
        [ring(9, *cap), ring(17, *g)],                            # cap taper
        [ring(17, *g), ring(grip_end, *g)],                       # grip
        [ring(grip_end, *g),
         ring(shape["handle"] + THROAT_REACH, THROAT_WIDTH, THICKNESS, 2.0)],
    ]
    return Manifold.batch_boolean(
        [Manifold.hull_points(np.vstack(s)) for s in stations], OpType.Add)


def throat_footprint(shape):
    y0 = shape["handle"] - THROAT_START
    y1 = shape["handle"] + THROAT_REACH
    return CrossSection.hull_points(np.array([
        (-GRIP_WIDTH / 2, y0), (GRIP_WIDTH / 2, y0),
        (-THROAT_WIDTH / 2, y1), (THROAT_WIDTH / 2, y1)]))


def build(shape, flat_bottom=True):
    z0 = 0.0 if flat_bottom else -THICKNESS / 2
    outline = face_outline(shape)
    slab = rounded_slab(outline, z0, z0 + THICKNESS, EDGE_RADIUS)

    region = (outline.offset(-RIM_WIDTH)
              - throat_footprint(shape).offset(RIM_WIDTH))
    holes = Manifold.extrude(honeycomb_holes(region), THICKNESS + 2).translate(
        (0, 0, z0 - 1))
    return (slab - holes) + handle(shape, flat_bottom)


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


def centroid_y(solid):
    """Y of the volume centroid, summed over tetrahedra fanned from the origin."""
    mesh = solid.to_mesh()
    v = np.asarray(mesh.vert_properties)[:, :3].astype(np.float64)
    t = np.asarray(mesh.tri_verts)
    a, b, c = v[t[:, 0]], v[t[:, 1]], v[t[:, 2]]
    vol = np.einsum("ij,ij->i", a, np.cross(b, c)) / 6
    return float((vol * (a[:, 1] + b[:, 1] + c[:, 1]) / 4).sum() / vol.sum())


def stats(solid, shape, density=1.25, handle_fill=0.35):
    """Key figures; mass assumes a solid face and a partly filled handle."""
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
    bed, bed_deg = min_square_bed(solid)
    return dict(
        size=(x1 - x0, y1 - y0, z1 - z0),
        length_in=shape["length"] / INCH, width_in=shape["width"] / INCH,
        handle_in=shape["handle"] / INCH,
        total_in=(shape["length"] + shape["width"]) / INCH,
        cells=solid.genus(), face_cm3=face_cm3, grip_cm3=grip_cm3,
        mass_g=mass, mass_oz=mass / 28.3495, balance_mm=balance,
        bed=bed, bed_deg=bed_deg, density=density, handle_fill=handle_fill)


def report(st):
    print(f"  size        : {st['size'][0]:.1f} x {st['size'][1]:.1f} x "
          f"{st['size'][2]:.1f} mm")
    print(f"  inches      : {st['length_in']:.2f} x {st['width_in']:.2f} in, "
          f"handle {st['handle_in']:.2f} in")
    print(f"  length+width: {st['total_in']:.2f} in (limit 24 in)")
    print(f"  honeycomb   : {st['cells']} cells")
    print(f"  volume      : face {st['face_cm3']:.0f} cm3, "
          f"handle {st['grip_cm3']:.0f} cm3")
    print(f"  est. mass   : {st['mass_g']:.0f} g ({st['mass_oz']:.1f} oz) "
          f"@ {st['density']} g/cm3, handle {st['handle_fill']:.0%} filled")
    print(f"  balance     : {st['balance_mm']:.0f} mm "
          f"({st['balance_mm'] / INCH:.2f} in) from the butt")
    print(f"  square bed  : >= {st['bed']:.0f} mm (rotated {st['bed_deg']} deg)")


def output_name(shape_name, grip):
    suffix = "_symmetric" if grip == "symmetric" else ""
    return os.path.join("stl", f"pickleball_paddle_{shape_name}{suffix}.stl")


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--shape", choices=list(SHAPES), default="elongated")
    ap.add_argument("--grip", choices=["flat", "symmetric"], default="flat",
                    help="flat: grip flush with the face's underside, prints "
                         "without supports; symmetric: grip centred on the face")
    ap.add_argument("--all", action="store_true",
                    help="write every shape in both grip styles")
    ap.add_argument("-o", "--output")
    args = ap.parse_args()

    jobs = ([(s, g) for s in SHAPES for g in ("flat", "symmetric")]
            if args.all else [(args.shape, args.grip)])
    for shape_name, grip in jobs:
        out = (args.output if args.output and not args.all
               else output_name(shape_name, grip))
        os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
        shape = SHAPES[shape_name]
        solid = build(shape, flat_bottom=grip == "flat")
        tris = write_stl(solid, out)
        print(f"{out}: {tris} triangles")
        report(stats(solid, shape))


if __name__ == "__main__":
    main()
