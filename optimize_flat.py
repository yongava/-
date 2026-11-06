#!/usr/bin/env python3
"""Search for the best lay-flat paddle at a given face thickness.

Every candidate (lattice pattern, cell size, wall, rim width) gets its side
pads re-tuned so it weighs TARGET_G, is screened for wall buckling under a
hard drive and for cell size, and is then scored by the sweet-spot area
(analyze_paddle.py) at 1 and 2 ms of contact: John Kew's high-speed footage
puts real contact at two milliseconds or less.

    python3 optimize_flat.py --thickness 16 --shape elongated
"""

import argparse
import json
import math

import numpy as np

import analyze_paddle as ap
import generate_paddle as gp

TARGET_G, TOL_G = 225.0, 3.0
F_PEAK, R_CONTACT = 800.0, 10.0          # N, mm: a hard drive, contact patch
MIN_MARGIN, MAX_OPENING = 3.0, 20.5      # wall buckling margin, cell size (mm)
TAUS = (1e-3, 2e-3)


def configure(thickness, pattern_pitch, rim, wall):
    gp.lay_flat(thickness)
    gp.RIB_DENSITY = 2 / pattern_pitch
    gp.RIM_WIDTH = rim
    gp.WALL = wall


def span_and_opening(pattern, pitch, wall):
    """Wall length between junctions and widest cell opening (mm)."""
    span = {"honeycomb": pitch / math.sqrt(3), "square": pitch, "diamond": pitch,
            "triangle": math.sqrt(3) * pitch, "octagon": 0.5147 * pitch}[pattern]
    opening = (1.2426 * pitch if pattern == "octagon" else pitch) - wall
    return span, opening


def wall_margin(pattern, pitch, wall, thickness):
    """Lateral-torsional buckling of a wall between junctions under a top-edge
    line load, ends held by its neighbours, against a hard drive."""
    e = ap.E_MODULUS / 1e6                                # MPa
    g = e / (2 * (1 + ap.POISSON))
    span, _ = span_and_opening(pattern, pitch, wall)
    iz = thickness * wall**3 / 12
    j = thickness * wall**3 / 3 * (1 - 0.63 * wall / thickness)
    m_cr = 2 * (math.pi / span) * math.sqrt(e * iz * g * j) * 0.7
    q_cr = 12 * m_cr / span**2
    q = F_PEAK / ((2 / pitch) * math.pi * R_CONTACT**2)
    return q_cr / q


def mass(shape, pattern, pad):
    solid = gp.build(shape, flat_bottom=False, pattern=pattern, side_pad=pad)
    return ap.weight_metrics(solid, shape)["mass_g"]


def evaluate(shape_name, thickness, pattern, pitch, wall, rim, taus=TAUS):
    shape = gp.SHAPES[shape_name]
    configure(thickness, pitch, rim, wall)
    _, opening = span_and_opening(pattern, pitch, wall)
    out = dict(shape=shape_name, thickness=thickness, pattern=pattern, pitch=pitch,
               wall=wall, rim=rim, opening=opening,
               margin=wall_margin(pattern, pitch, wall, thickness))
    if opening > MAX_OPENING:
        return dict(out, skip="cells too large")
    if out["margin"] < MIN_MARGIN:
        return dict(out, skip="walls would buckle")
    m0, m10 = mass(shape, pattern, 0.0), mass(shape, pattern, 10.0)
    if m0 > TARGET_G + TOL_G:
        return dict(out, skip=f"{m0:.0f} g without pads")
    pad = min(16.0, 10 * (TARGET_G - m0) / (m10 - m0))
    pad = min(16.0, pad + 10 * (TARGET_G - mass(shape, pattern, pad)) / (m10 - m0))
    r = ap.analyze(shape_name, pattern, side_pad=pad, contact_times=taus)
    keys = list(r["impacts"])
    sweet = [r["impacts"][k]["area_cm2"] for k in keys]
    return dict(out, pad=pad, mass=r["mass_g"], sw=r["swing_weight"],
                tw=r["twist_weight"], bend=r["bend_hz"], twist=r["twist_hz"],
                sweet=sweet, zone=[r["impacts"][k]["zone_mean"] for k in keys],
                score=float(np.mean(sweet[:2])))


def describe(r):
    head = f"{r['pattern']:9s} cell {r['pitch']:4.1f} wall {r['wall']:.1f} rim {r['rim']:.1f}"
    if "skip" in r:
        return f"{head}  skipped: {r['skip']}"
    return (f"{head} pad {r['pad']:4.1f} | {r['mass']:5.1f} g SW {r['sw']:5.1f} "
            f"TW {r['tw']:4.2f} | {r['bend']:3.0f}/{r['twist']:3.0f} Hz | margin "
            f"{r['margin']:4.1f} | sweet {'/'.join(f'{a:.0f}' for a in r['sweet'])} cm2 "
            f"| score {r['score']:.1f}")


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--shape", choices=list(gp.SHAPES), default="elongated")
    parser.add_argument("--thickness", type=float, default=16.0)
    parser.add_argument("--json")
    args = parser.parse_args()
    results = []
    for pattern in gp.PATTERNS:
        for pitch in (13.0, 15.0, 17.0, 18.0, 19.0):
            for wall in (0.8, 1.0):
                for rim in (3.0, 4.5, 5.5):
                    r = evaluate(args.shape, args.thickness, pattern, pitch, wall, rim)
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
