#!/usr/bin/env python3
"""Spin from an oblique ball-on-face impact: friction, grip and snapback.

The ball is a hollow sphere hitting a clamped face.  Normal contact is a
spring and damper that cannot pull (as in analyze_paddle.py).  Tangential
contact is a spring with damping whose force is capped by Coulomb friction,
so the ball can slide, grip, and, if the surface is springy sideways, snap
back and leave spinning faster than it would by rolling.

The default shot copies John Kew's spin rig: a 70 mph ball onto a paddle held
at 30 degrees.  Surfaces are described by their friction coefficient, their
sideways stiffness relative to the normal stiffness, and their sideways
damping.

    python3 spin_model.py
"""

import math

import numpy as np

import analyze_paddle as ap

BALL_RADIUS = 0.037        # m
BALL_INERTIA = 2.3e-5      # kg m^2, hollow shell with ~2.5 mm wall
MPH = 0.44704              # m/s
RPM = 60 / (2 * math.pi)


def impact(mu, kt_ratio, zeta_t, speed=70 * MPH, angle=30.0, contact_time=1.5e-3):
    """Spin (rpm), rebound speed and slide distance for one impact.

    mu        friction coefficient between ball and surface
    kt_ratio  sideways stiffness of the contact / normal stiffness
    zeta_t    damping ratio of the sideways spring (0 = perfectly springy)
    angle     angle between the ball's path and the face (degrees)
    """
    m, r, inertia = ap.BALL_MASS, BALL_RADIUS, BALL_INERTIA
    kn, cn = ap.ball_contact(contact_time)
    kt = kt_ratio * kn
    m_t = 1 / (1 / m + r * r / inertia)       # mass felt by the contact point
    ct = 2 * zeta_t * math.sqrt(kt * m_t)
    vn = speed * math.sin(math.radians(angle))
    vt = speed * math.cos(math.radians(angle))
    x, w = 0.0, 0.0                           # indentation, ball spin
    s = 0.0                                   # stretch of the sideways spring
    slide = 0.0
    dt = contact_time / 4000
    while True:
        fn = max(kn * x + cn * vn, 0.0) if x > 0 or vn > 0 else 0.0
        slip = vt - w * r                     # contact point speed along the face
        ft = kt * s + ct * slip               # sideways force on the ball (resisting)
        limit = mu * fn
        if abs(ft) > limit:                   # sliding: friction caps the force
            ft = math.copysign(limit, ft)
            s = ft / kt if kt > 0 else 0.0
            slide += abs(slip) * dt
        else:
            s += slip * dt                    # gripping: the spring stretches
        vn -= fn / m * dt
        vt -= ft / m * dt
        w += ft * r / inertia * dt
        x += vn * dt
        if x <= 0 and vn < 0:
            return dict(rpm=w * RPM, rebound=math.hypot(vn, vt), slide_mm=slide * 1000,
                        roll_rpm=vt / r * RPM)


def rolling_rpm(speed=70 * MPH, angle=30.0):
    """Spin if the ball grips fully and leaves rolling, with no snapback."""
    vt = speed * math.cos(math.radians(angle))
    k = BALL_INERTIA / (ap.BALL_MASS * BALL_RADIUS**2)
    return vt / ((1 + k) * BALL_RADIUS) * RPM


# mu = 0.20 reproduces the ~2,000 rpm average of reviewers' databases on this
# shot, and 0.25 the ~2,600 rpm best grit paddles; the rest are estimates.
SURFACES = {
    "PETG rib edges, as printed": dict(mu=0.22, kt_ratio=0.8, zeta_t=0.3),
    "Grit on rib tops": dict(mu=0.40, kt_ratio=0.8, zeta_t=0.3),
    "Woven mesh, fused crossings": dict(mu=0.50, kt_ratio=0.6, zeta_t=0.3),
    "TPU tread on rib tops": dict(mu=0.90, kt_ratio=0.3, zeta_t=0.35),
    "Springy fins on rib tops": dict(mu=0.45, kt_ratio=0.15, zeta_t=0.05),
    "Woven strands that slide": dict(mu=0.45, kt_ratio=0.06, zeta_t=0.05),
}


def main():
    print(f"rolling limit at 70 mph, 30 deg: {rolling_rpm():.0f} rpm")
    for name, p in SURFACES.items():
        r = impact(**p)
        print(f"{name:28s} mu {p['mu']:.2f} kt/kn {p['kt_ratio']:.2f} zeta {p['zeta_t']:.2f}"
              f" -> {r['rpm']:5.0f} rpm, slides {r['slide_mm']:4.1f} mm")


if __name__ == "__main__":
    main()
