#!/usr/bin/env python3
"""Search for the best lay-flat paddle at a given face thickness.

Every candidate (lattice pattern, cell size, wall, rim width, and with
--skin the woven skin's strand spacing) gets its side pads re-tuned so it
weighs TARGET_G, is screened for wall buckling and crushing under a hard
drive and for cell size, and is then scored by the sweet-spot area
(analyze_paddle.py) at 1 and 2 ms of contact: John Kew's high-speed footage
puts real contact at two milliseconds or less.

    python3 optimize_flat.py --thickness 16 --shape elongated
    python3 optimize_flat.py --thickness 14 --skin 0.8 --shape elongated
"""

import argparse
import json
import math

import numpy as np

import analyze_paddle as ap
import generate_paddle as gp

TARGET_G, TOL_G = 225.0, 3.0             # target, and how far over it a bare frame may be
F_PEAK, R_CONTACT = 800.0, 10.0          # N, mm: a hard drive, contact patch
MIN_MARGIN, MIN_CRUSH, MAX_OPENING = 3.0, 1.5, 20.5   # buckling, crushing, cell size (mm)
CRUSH_MPA = 50.0                         # PETG compressive strength, conservative
TAUS = (1e-3, 2e-3)


def configure(thickness, pattern_pitch, rim, wall, skin=0.0, mesh_pitch=None):
    """`thickness` is the core's; skins of `skin` mm go on both faces."""
    gp.SKIN = skin
    gp.lay_flat(thickness + 2 * skin)
    gp.RIB_DENSITY = 2 / pattern_pitch
    gp.RIM_WIDTH = rim
    gp.WALL = wall
    if mesh_pitch is not None:
        gp.MESH_PITCH = mesh_pitch


def span_and_opening(pattern, pitch, wall):
    """Wall length between junctions and widest cell opening (mm)."""
    span = {"honeycomb": pitch / math.sqrt(3), "square": pitch, "diamond": pitch,
            "triangle": math.sqrt(3) * pitch, "octagon": 0.5147 * pitch}[pattern]
    opening = (1.2426 * pitch if pattern == "octagon" else pitch) - wall
    return span, opening


def wall_margin(pattern, pitch, wall, depth, brace=None):
    """Lateral-torsional buckling of a wall between junctions under a top-edge
    line load, ends held by its neighbours, against a hard drive.  A skin
    braces the loaded edge every `brace` mm, which shortens the buckle."""
    e = ap.E_MODULUS / 1e6                                # MPa
    g = e / (2 * (1 + ap.POISSON))
    span, _ = span_and_opening(pattern, pitch, wall)
    buckle = span if brace is None else min(span, brace)
    iz = depth * wall**3 / 12
    j = depth * wall**3 / 3 * (1 - 0.63 * wall / depth)
    m_cr = 2 * (math.pi / buckle) * math.sqrt(e * iz * g * j) * 0.7
    q_cr = 12 * m_cr / span**2
    q = F_PEAK / ((2 / pitch) * math.pi * R_CONTACT**2)
    return q_cr / q


def crush_margin(pitch, wall):
    """Wall bearing stress under the contact patch of a hard drive, against
    PETG's compressive strength.  Every pattern lays 2/pitch of wall per area."""
    stress = F_PEAK / ((2 / pitch) * wall * math.pi * R_CONTACT**2)
    return CRUSH_MPA / stress


def mass(shape, pattern, pad):
    """Mass (g); the skins are added from their layer areas, which is much
    quicker than building them."""
    solid = gp.build(shape, flat_bottom=False, pattern=pattern, side_pad=pad, skin=False)
    grams = ap.weight_metrics(solid, shape)["mass_g"]
    if gp.SKIN > 0:
        _, _, region, _ = gp.face_regions(shape, pad)
        grams += ap.DENSITY * gp.skin_volume(region, gp.lattice(region, pattern)[0])
    return grams


def tune_pad(shape, pattern, steps=4, tol=0.3):
    """Side pad (mm) that brings the paddle to TARGET_G, by secant steps; None
    if even no pad is too heavy."""
    tried = [(0.0, mass(shape, pattern, 0.0))]
    if tried[0][1] > TARGET_G + TOL_G:
        return None, tried[0][1]
    tried.append((10.0, mass(shape, pattern, 10.0)))
    for _ in range(steps):
        (p0, m0), (p1, m1) = sorted(tried, key=lambda t: abs(t[1] - TARGET_G))[:2]
        pad = float(np.clip(p0 + (TARGET_G - m0) * (p1 - p0) / (m1 - m0), 0.0, 16.0))
        tried.append((pad, mass(shape, pattern, pad)))
        if abs(tried[-1][1] - TARGET_G) < tol or pad in (0.0, 16.0):
            break
    return min(tried, key=lambda t: abs(t[1] - TARGET_G))


def evaluate(shape_name, thickness, pattern, pitch, wall, rim, skin=0.0,
             mesh_pitch=None, taus=TAUS):
    shape = gp.SHAPES[shape_name]
    configure(thickness, pitch, rim, wall, skin, mesh_pitch)
    _, opening = span_and_opening(pattern, pitch, wall)
    brace = math.sqrt(2) * gp.MESH_PITCH if skin > 0 else None
    out = dict(shape=shape_name, thickness=thickness, pattern=pattern, pitch=pitch,
               wall=wall, rim=rim, skin=skin, mesh_pitch=gp.MESH_PITCH if skin else None,
               opening=opening, crush=crush_margin(pitch, wall),
               margin=wall_margin(pattern, pitch, wall, gp.wall_depth(), brace))
    if opening > MAX_OPENING:
        return dict(out, skip="cells too large")
    if out["margin"] < MIN_MARGIN:
        return dict(out, skip="walls would buckle")
    if out["crush"] < MIN_CRUSH:
        return dict(out, skip="walls would crush")
    pad, m = tune_pad(shape, pattern)
    if pad is None:
        return dict(out, skip=f"{m:.0f} g without pads")
    r = ap.analyze(shape_name, pattern, side_pad=pad, contact_times=taus)
    keys = list(r["impacts"])
    sweet = [r["impacts"][k]["area_cm2"] for k in keys]
    return dict(out, pad=pad, mass=r["mass_g"], sw=r["swing_weight"],
                tw=r["twist_weight"], balance=r["balance_mm"], bend=r["bend_hz"],
                twist=r["twist_hz"], sweet=sweet,
                zone=[r["impacts"][k]["zone_mean"] for k in keys],
                score=float(np.mean(sweet[:2])))


def describe(r):
    head = (f"{r['pattern']:9s} cell {r['pitch']:4.1f} wall {r['wall']:.1f} rim {r['rim']:.1f}"
            + (f" mesh {r['mesh_pitch']:.0f}" if r.get("mesh_pitch") else ""))
    if "skip" in r:
        return f"{head}  skipped: {r['skip']}"
    return (f"{head} pad {r['pad']:4.1f} | {r['mass']:5.1f} g SW {r['sw']:5.1f} "
            f"TW {r['tw']:4.2f} | {r['bend']:3.0f}/{r['twist']:3.0f} Hz | margin "
            f"{r['margin']:4.1f} crush {r['crush']:3.1f} | sweet "
            f"{'/'.join(f'{a:.0f}' for a in r['sweet'])} cm2 | score {r['score']:.1f}")


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--shape", choices=list(gp.SHAPES), default="elongated")
    parser.add_argument("--thickness", type=float, default=16.0,
                        help="face thickness, or the core's with --skin (mm)")
    parser.add_argument("--skin", type=float, default=0.0,
                        help="woven skin on each face (mm); 0 = open lattice")
    parser.add_argument("--cells", type=float, nargs="+", default=[18.0, 19.0, 20.0],
                        help="honeycomb cell sizes to try with --skin (mm)")
    parser.add_argument("--rims", type=float, nargs="+", default=[3.0, 4.5, 5.5],
                        help="rim widths to try with --skin (mm)")
    parser.add_argument("--meshes", type=float, nargs="+", default=[4.0, 5.0, 6.0],
                        help="strand spacings to try with --skin (mm)")
    parser.add_argument("--json")
    args = parser.parse_args()
    results = []
    if args.skin > 0:
        # Skins brace the walls, so honeycomb only, with larger cells.
        grid = [("honeycomb", pitch, 0.8, rim, mesh) for pitch in args.cells
                for rim in args.rims for mesh in args.meshes]
    else:
        grid = [(pattern, pitch, wall, rim, None) for pattern in gp.PATTERNS
                for pitch in (13.0, 15.0, 17.0, 18.0, 19.0)
                for wall in (0.8, 1.0) for rim in (3.0, 4.5, 5.5)]
    for pattern, pitch, wall, rim, mesh in grid:
        r = evaluate(args.shape, args.thickness, pattern, pitch, wall, rim, args.skin, mesh)
        results.append(r)
        print(describe(r), flush=True)
    ranked = sorted((r for r in results if "skip" not in r), key=lambda r: -r["score"])
    print("\nbest:")
    for r in ranked[:5]:
        print(describe(r))
    if args.json:
        with open(args.json, "w") as fh:
            json.dump(results, fh)


if __name__ == "__main__":
    main()
