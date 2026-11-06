#!/usr/bin/env python3
"""Weight, swing weight, twist weight and sweet spot of a generated paddle.

For a paddle built by generate_paddle.py this computes:

* weight, balance point, swing weight and twist weight, in the conventions
  paddle reviewers publish: swing weight about an axis 5 cm (2 in) up from
  the butt, twist weight about the long centre-line, both in kg*cm^2;
* the centre of percussion for a pivot 3 in up the handle (the centre of the
  palm, as Pickleball Science uses);
* free-free vibration modes of a beam-grid (grillage) model of the ribs, rim
  and handle;
* a rebound map: a ball strikes the stationary, free paddle at points across
  the face, and the contact is integrated through those modes.  The sweet
  spot is the area that returns at least 95 % of the paddle's best rebound.

    python3 analyze_paddle.py --shape elongated --pattern honeycomb diamond
"""

import argparse
import json
import math

import numpy as np
import scipy.sparse as sp
from manifold3d import Manifold
from scipy.sparse.linalg import eigsh
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import nearest_points, unary_union

import generate_paddle as gp

# Material and printing (PETG)
DENSITY = 1.25e-3          # g/mm^3
HANDLE_FILL = 0.35         # handle mass fraction with ~15-20 % infill
E_MODULUS = 2.0e9          # Pa
POISSON = 0.38
HANDLE_STIFFNESS = 0.6     # handle bending/torsion stiffness vs solid section
MODAL_DAMPING = 0.02

# Measurement conventions
SWING_PIVOT = 50.0         # mm from the butt (Briffidi SW1, 5 cm adapter)
PALM_PIVOT = 76.2          # mm from the butt (3 in, centre of the palm)

# Ball and impact model
BALL_MASS = 0.026          # kg
BALL_COR = 0.6             # on a rigid surface
CONTACT_TIMES = (1e-3, 2e-3, 4e-3)  # s, on a rigid surface; not well known,
                                    # so every design is scored at all three
PATCH_RADIUS = 12.0        # mm, radius of the ribs the ball touches
GRID = 5.0                 # mm between impact points
SWEET_REBOUND = 0.37       # sweet spot: ball returns >= 37 % of its speed,
                           # 90 % of a perfectly stiff 213 g paddle's best
ZONE = (32.0, 57.0)        # mm half-axes of the 2.5 x 4.5 in hitting oval

G_MM2_TO_KG_CM2 = 1e-5


# --- mass properties -------------------------------------------------------

def moments(solid):
    """Volume (mm^3), first moment (mm^4) and second-moment tensor (mm^5)."""
    if solid.is_empty():
        return 0.0, np.zeros(3), np.zeros((3, 3))
    mesh = solid.to_mesh()
    v = np.asarray(mesh.vert_properties)[:, :3].astype(np.float64)
    t = np.asarray(mesh.tri_verts)
    a, b, c = v[t[:, 0]], v[t[:, 1]], v[t[:, 2]]
    vol = np.einsum("ij,ij->i", a, np.cross(b, c)) / 6
    s = a + b + c
    second = sum(np.einsum("n,ni,nj->ij", vol, p, p) for p in (a, b, c, s)) / 20
    return vol.sum(), (vol[:, None] * s).sum(axis=0) / 4, second


def slab(solid, y0, y1):
    big = 2000.0
    return solid ^ Manifold.cube((big, y1 - y0, big)).translate(
        (-big / 2, y0, -big / 2))


def mass_moments(solid, shape):
    """Mass (g), first (g*mm) and second (g*mm^2) moments: solid face,
    partly filled handle."""
    handle = slab(solid, -1.0, shape["handle"])
    face = slab(solid, shape["handle"], 1000.0)
    out = [0.0, np.zeros(3), np.zeros((3, 3))]
    for part, rho in ((face, DENSITY), (handle, DENSITY * HANDLE_FILL)):
        v, f, s = moments(part)
        out[0] += rho * v
        out[1] = out[1] + rho * f
        out[2] = out[2] + rho * s
    return out


def inertia(mm, point, axis):
    """Moment of inertia (g*mm^2) about the axis through `point` along `axis`."""
    m, f, s = mm
    d = np.asarray(point, float)
    u = np.asarray(axis, float) / np.linalg.norm(axis)
    c = s - np.outer(d, f) - np.outer(f, d) + m * np.outer(d, d)
    return np.trace(c) - u @ c @ u


def weight_metrics(solid, shape):
    mm = mass_moments(solid, shape)
    m, f, _ = mm
    cg = f / m
    recoil = inertia(mm, cg, (1, 0, 0))
    cop = cg[1] + recoil / (m * (cg[1] - PALM_PIVOT))
    return dict(
        mass_g=m, mass_oz=m / 28.3495, balance_mm=cg[1],
        swing_weight=inertia(mm, (0, SWING_PIVOT, 0), (1, 0, 0)) * G_MM2_TO_KG_CM2,
        twist_weight=inertia(mm, (0, 0, 0), (0, 1, 0)) * G_MM2_TO_KG_CM2,
        recoil_weight=recoil * G_MM2_TO_KG_CM2, cop_mm=cop)


# --- grillage model --------------------------------------------------------

def rect_torsion(w, h):
    """Saint-Venant torsion constant of a w x h rectangle (any order)."""
    a, b = max(w, h), min(w, h)
    return a * b**3 * (1 / 3 - 0.21 * (b / a) * (1 - (b / a)**4 / 12))


def beam_k(length, c, s, ei, gj):
    """Stiffness of a grillage beam in global [w, theta_x, theta_y] x 2 nodes."""
    L = length
    kb = ei / L**3 * np.array([[12, 6 * L, -12, 6 * L],
                               [6 * L, 4 * L * L, -6 * L, 2 * L * L],
                               [-12, -6 * L, 12, -6 * L],
                               [6 * L, 2 * L * L, -6 * L, 4 * L * L]])
    flip = np.diag([1.0, -1.0, 1.0, -1.0])     # theta_eta = -dw/dxi
    kl = np.zeros((6, 6))
    ib = [0, 2, 3, 5]
    kl[np.ix_(ib, ib)] = flip @ kb @ flip
    kl[np.ix_([1, 4], [1, 4])] = gj / L * np.array([[1.0, -1.0], [-1.0, 1.0]])
    r = np.array([[1, 0, 0], [0, c, s], [0, -s, c]])
    t = np.zeros((6, 6))
    t[:3, :3] = t[3:, 3:] = r
    return t.T @ kl @ t


class Grillage:
    """Beam grid in the face plane; 3 DOF per node (w, theta_x, theta_y)."""

    def __init__(self):
        self.xy = []
        self.key = {}
        self.elems = []        # (i, j, EI, GJ, kg/m, depth m)
        self.tied = set()
        self.extra_mass = {}   # node -> (kg, rotary kg*m^2 about x, about y)

    def node(self, p):
        k = (round(float(p[0]), 4), round(float(p[1]), 4))
        if k not in self.key:
            self.key[k] = len(self.xy)
            self.xy.append(k)
        return self.key[k]

    def beam(self, p, q, width, depth, max_len, modulus=E_MODULUS, scale=1.0):
        """Rectangular-section beam from p to q (mm), split into short pieces."""
        p, q = np.asarray(p, float), np.asarray(q, float)
        n = max(1, math.ceil(np.linalg.norm(q - p) / max_len))
        w, h = width / 1000, depth / 1000
        ei = modulus * scale * w * h**3 / 12
        gj = modulus / (2 * (1 + POISSON)) * scale * rect_torsion(w, h)
        nodes = [self.node(p + (q - p) * k / n) for k in range(n + 1)]
        for i, j in zip(nodes, nodes[1:]):
            if i != j:
                self.elems.append((i, j, ei, gj, DENSITY * 1e6 * w * h, h))
        return nodes


def solid_section(width, depth, chamfer):
    """Second moment (m^4, bending out of the face plane) and torsion constant
    of the octagonal grip."""
    hw, hd, c = width / 2000, depth / 2000, chamfer / 1000
    z = np.linspace(-hd, hd, 401)
    half = np.minimum(hw, hw - c + (hd - np.abs(z)))
    half = np.where(np.abs(z) > hd - c, half, hw)
    ixx = np.trapezoid(2 * half * z**2, z)
    area = np.trapezoid(2 * half, z)
    j = rect_torsion(2 * hw, 2 * hd) * area / (4 * hw * hd)
    return ixx, j


def build_grillage(shape, pattern, wall, solid, side_pad=None):
    """Grillage of ribs, rim and handle; the throat is a rigid body."""
    outline, plan, region, throat_solid = gp.face_regions(shape, side_pad)
    _, segments, thick = gp.lattice(region, pattern, wall)
    poly = lambda cs: unary_union([Polygon(c) for c in cs.to_polygons()
                                   if Polygon(c).area > 0]).buffer(0)
    region_p, throat_p = poly(region), poly(throat_solid)
    region_edge = region_p.boundary

    g = Grillage()
    rim_line = max((LineString(np.vstack([c, c[:1]]))
                    for c in outline.offset(-gp.RIM_WIDTH / 2).to_polygons()),
                   key=lambda l: l.length)

    # Clip the ribs to the lattice region; ends on its edge either meet the
    # rim (at the nearest rim station) or the rigid throat.
    pieces, attach = [], []
    for (p, q), t in zip(segments, thick):
        piece = region_p.intersection(LineString([p, q]))
        for line in getattr(piece, "geoms", [piece]):
            if line.is_empty or line.geom_type != "LineString":
                continue
            ends = [np.asarray(c) for c in (line.coords[0], line.coords[-1])]
            kinds = []
            for e in ends:
                if region_edge.distance(Point(e)) > 1e-6:
                    kinds.append(None)
                elif throat_p.distance(Point(e)) < 1e-3:
                    kinds.append("tie")
                else:
                    kinds.append(rim_line.project(Point(e)))
                    attach.append(kinds[-1])
            pieces.append((ends, t, kinds))

    # Rim stations: every attachment (merged when closer than 1 mm) plus
    # regular stations, never closer than 1 mm, to keep elements well shaped.
    length = rim_line.length
    stations = []
    for s in sorted(attach):
        if not stations or s - stations[-1] > 1.0:
            stations.append(s)
    if len(stations) > 1 and stations[0] + length - stations[-1] <= 1.0:
        stations.pop()
    arr = np.array(stations)
    for s in np.arange(0, length, 5.0):
        gap = np.abs(arr - s) if len(arr) else np.array([np.inf])
        if np.minimum(gap, length - gap).min() > 2.0:
            stations.append(s)
    stations = np.sort(stations)
    pts = np.array([rim_line.interpolate(s).coords[0] for s in stations])
    # Where side pads widen the rim, move its centre-line inward to the
    # middle of the solid band and widen the beam to match.
    widths = np.full(len(pts), gp.RIM_WIDTH)
    for k, p in enumerate(pts):
        if throat_p.distance(Point(p)) < 0.5:
            continue
        near = nearest_points(Point(p), region_edge)[1]
        gap = near.distance(Point(p))
        pad = min(max(gap - gp.RIM_WIDTH / 2, 0.0), 20.0)
        if pad > 0.05:
            widths[k] += pad
            pts[k] = p + (np.array(near.coords[0]) - p) / gap * pad / 2

    def snap(s):
        gap = np.abs(stations - s)
        return pts[np.argmin(np.minimum(gap, length - gap))]

    for ends, t, kinds in pieces:
        for k, kind in enumerate(kinds):
            if kind is not None and kind != "tie":
                ends[k] = snap(kind)
        if np.linalg.norm(ends[1] - ends[0]) < 0.5:
            continue                          # sliver of rib inside the rim
        nodes = g.beam(ends[0], ends[1], t, gp.THICKNESS, 4.0)
        for k, kind in enumerate(kinds):
            if kind == "tie":
                g.tied.add(nodes[0] if k == 0 else nodes[-1])
    for a, b, wa, wb in zip(pts, np.roll(pts, -1, axis=0),
                            widths, np.roll(widths, -1)):
        g.beam(a, b, (wa + wb) / 2, gp.THICKNESS, 6.0)
    for i, (x, y) in enumerate(g.xy):
        if throat_p.distance(Point(x, y)) < 0.5:
            g.tied.add(i)

    # Handle: beam of the grip section from the butt to where the throat starts.
    top = shape["handle"] - gp.THROAT_START
    ys = np.linspace(0, top, 15)
    ixx, j = solid_section(gp.GRIP_WIDTH, gp.GRIP_DEPTH, gp.GRIP_CHAMFER)
    hnodes = [g.node((0.0, y)) for y in ys]
    gmod = E_MODULUS * HANDLE_STIFFNESS
    for a, b in zip(hnodes, hnodes[1:]):
        g.elems.append((a, b, gmod * ixx, gmod / (2 * (1 + POISSON)) * j, 0.0, 0.0))
    g.tied.add(hnodes[-1])
    edges = np.concatenate([[ys[0]], (ys[1:] + ys[:-1]) / 2, [ys[-1]]])
    for k, n in enumerate(hnodes):
        v, f, s = moments(slab(solid, edges[k], edges[k + 1]))
        m = DENSITY * HANDLE_FILL * v / 1000            # kg
        g.extra_mass[n] = (m, m * (gp.GRIP_DEPTH / 1000)**2 / 12,
                           m * ((gp.GRIP_WIDTH / 1000)**2
                                + (gp.GRIP_DEPTH / 1000)**2) / 12)

    # Rigid throat: everything from the top of the grip up through the
    # solid area where the face meets the neck.
    big = 2000.0
    throat_prism = Manifold.extrude(throat_solid, big).translate((0, 0, -big / 2))
    parts = [(slab(solid, top, shape["handle"]), DENSITY * HANDLE_FILL),
             (slab(solid, shape["handle"], 1000.0) ^ throat_prism, DENSITY)]
    rigid = [0.0, np.zeros(3), np.zeros((3, 3))]
    for part, rho in parts:
        v, f, s = moments(part)
        rigid = [rigid[0] + rho * v, rigid[1] + rho * f, rigid[2] + rho * s]
    face_target = DENSITY * moments(slab(solid, shape["handle"], 1000.0)
                                    - throat_prism)[0]
    return g, rigid, face_target, (0.0, shape["handle"]), region_p, throat_p


def assemble(g, rigid, face_target, master_xy):
    """Reduced stiffness and mass matrices; tied nodes follow the rigid throat."""
    n = len(g.xy)
    xy = np.array(g.xy) / 1000                       # m
    rows, cols, vals = [], [], []
    mass = np.zeros(3 * n)
    for i, j, ei, gj, mpl, depth in g.elems:
        d = xy[j] - xy[i]
        L = float(np.hypot(*d))
        k = beam_k(L, d[0] / L, d[1] / L, ei, gj)
        dof = [3 * i, 3 * i + 1, 3 * i + 2, 3 * j, 3 * j + 1, 3 * j + 2]
        rows += np.repeat(dof, 6).tolist()
        cols += dof * 6
        vals += k.ravel().tolist()
        if i in g.tied and j in g.tied:
            continue                                  # inside the rigid throat
        m = mpl * L / 2
        for node in (i, j):
            mass[3 * node] += m
            mass[3 * node + 1] += m * depth**2 / 12
            mass[3 * node + 2] += m * depth**2 / 12
    # Scale the face's lumped masses to the solid model's face mass.
    face_nodes = [i for i in range(n) if i not in g.extra_mass]
    lumped = mass[[3 * i for i in face_nodes]].sum() * 1000      # g
    scale = face_target / lumped
    for i in face_nodes:
        mass[3 * i:3 * i + 3] *= scale
    for node, (m, ix, iy) in g.extra_mass.items():
        mass[3 * node:3 * node + 3] += (m, ix, iy)
    k_full = sp.csr_matrix((vals, (rows, cols)), shape=(3 * n, 3 * n))

    # Reduction: free nodes keep their DOFs, tied nodes follow the master.
    free = [i for i in range(n) if i not in g.tied]
    red = {node: 3 * k for k, node in enumerate(free)}
    nm = 3 * len(free)
    tr, tc, tv = [], [], []
    mx, my = master_xy[0] / 1000, master_xy[1] / 1000
    for i in range(n):
        if i in red:
            for a in range(3):
                tr.append(3 * i + a); tc.append(red[i] + a); tv.append(1.0)
        else:
            dx, dy = xy[i, 0] - mx, xy[i, 1] - my
            tr += [3 * i, 3 * i, 3 * i, 3 * i + 1, 3 * i + 2]
            tc += [nm, nm + 1, nm + 2, nm + 1, nm + 2]
            tv += [1.0, dy, -dx, 1.0, 1.0]
    t = sp.csr_matrix((tv, (tr, tc)), shape=(3 * n, nm + 3))
    k_red = (t.T @ k_full @ t).tocsc()
    m_red = (t.T @ sp.diags(mass) @ t).tolil()

    # Rigid throat: mass matrix of a rigid body about the master point.
    m, f, s = rigid                                   # g, g*mm, g*mm^2
    r0 = np.array([master_xy[0], master_xy[1], 0.0])
    c = s - np.outer(r0, f) - np.outer(f, r0) + m * np.outer(r0, r0)
    fm = f - m * r0
    mrb = np.array([[m, fm[1], -fm[0]],
                    [fm[1], c[2, 2] + c[1, 1], -c[0, 1]],
                    [-fm[0], -c[0, 1], c[2, 2] + c[0, 0]]])
    mrb *= np.array([[1e-3, 1e-6, 1e-6], [1e-6, 1e-9, 1e-9], [1e-6, 1e-9, 1e-9]])
    m_red[nm:nm + 3, nm:nm + 3] += mrb
    return k_red, m_red.tocsc(), t, scale


def modes(k_red, m_red, count=60):
    vals, vecs = eigsh(k_red, k=count, M=m_red, sigma=-1.0, which="LM")
    order = np.argsort(vals)
    vals, vecs = vals[order], vecs[:, order]
    norm = np.sqrt(np.einsum("ij,ij->j", vecs, m_red @ vecs))
    return np.sqrt(np.clip(vals, 0, None)) / (2 * math.pi), vecs / norm


# --- impact model ----------------------------------------------------------

def impact_points(region_p, throat_p, outline):
    hull = unary_union([Polygon(c) for c in outline.offset(-2.0).to_polygons()])
    minx, miny, maxx, maxy = hull.bounds
    pts = []
    for y in np.arange(math.ceil(miny / GRID) * GRID, maxy, GRID):
        for x in np.arange(math.ceil(minx / GRID) * GRID, maxx, GRID):
            p = Point(x, y)
            if hull.contains(p) and throat_p.distance(p) > 3.0:
                pts.append((x, y))
    return np.array(pts)


def wall_cor(kb, cb, contact_time):
    """COR of the ball model against a rigid wall; contact force can't pull."""
    dt = contact_time / 4000
    x, v = 0.0, 1.0
    while True:
        f = max(kb * x + cb * v, 0.0) if x > 0 or v > 0 else 0.0
        v -= f / BALL_MASS * dt
        x += v * dt
        if x <= 0 and v < 0:
            return -v


def ball_contact(contact_time):
    """Spring and damper of the ball: rigid-wall contact time `contact_time`
    (half period of the undamped spring) and rigid-wall COR BALL_COR."""
    kb = BALL_MASS * (math.pi / contact_time)**2
    lo, hi = 0.0, 4 * math.sqrt(kb * BALL_MASS)
    for _ in range(40):
        cb = (lo + hi) / 2
        lo, hi = (cb, hi) if wall_cor(kb, cb, contact_time) > BALL_COR else (lo, cb)
    return kb, (lo + hi) / 2


def rebound(points, g, t, freqs, vecs, contact_time, rigid_only=False):
    """Apparent COR of a ball striking the free paddle at each point."""
    xy = np.array(g.xy)
    full = t @ vecs
    w_full, ty_full = full[0::3], full[2::3]          # w and theta_y per mode
    if rigid_only:
        keep = freqs < 1.0
        freqs, w_full, ty_full = freqs[keep], w_full[:, keep], ty_full[:, keep]
    psi = np.zeros((len(points), len(freqs)))
    tilt = np.zeros_like(psi)
    for k, p in enumerate(points):
        d = np.hypot(*(xy - p).T)
        near = d < PATCH_RADIUS
        if not near.any():
            near = d <= np.sort(d)[2]
        wts = np.clip(1 - (d[near] / PATCH_RADIUS)**2, 0.05, None)
        psi[k] = wts @ w_full[near] / wts.sum()
        tilt[k] = wts @ ty_full[near] / wts.sum()

    kb, cb = ball_contact(contact_time)
    omega = 2 * math.pi * freqs
    zeta = np.where(freqs < 1.0, 0.0, MODAL_DAMPING)
    dt = min(contact_time / 400, 0.05 / max(omega.max(), 1.0))

    n = len(points)
    q = np.zeros((n, len(freqs)))
    qd = np.zeros_like(q)
    sb, vb = np.zeros(n), np.ones(n)                  # ball moves into face at 1 m/s
    out = np.full(n, np.nan)
    tilt_out = np.full(n, np.nan)
    tilt_sum = np.zeros(n)                            # force-weighted face tilt
    touched = np.zeros(n, bool)
    active = np.ones(n, bool)
    for _ in range(int(20 * contact_time / dt)):
        u = (psi * q).sum(axis=1)
        ud = (psi * qd).sum(axis=1)
        delta = sb - u
        f = np.where(delta > 0, np.maximum(kb * delta + cb * (vb - ud), 0.0), 0.0)
        f[~active] = 0.0
        tilt_sum += f * (tilt * q).sum(axis=1) * dt
        touched |= delta > 0
        sep = active & touched & (delta <= 0)
        out[sep] = -vb[sep]
        # Impulse that stopped and returned the ball: m (v_in + v_out).
        tilt_out[sep] = tilt_sum[sep] / (BALL_MASS * (1 - vb[sep]))
        active &= ~sep
        if not active.any():
            break
        qdd = psi * f[:, None] - 2 * zeta * omega * qd - omega**2 * q
        qd += qdd * dt
        q += qd * dt
        vb -= f / BALL_MASS * dt
        sb += vb * dt
    # A face tilted by a sends the ball off by about a (1 + 1/e) radians;
    # meaningless where the ball barely comes back.
    with np.errstate(divide="ignore", invalid="ignore"):
        angle = np.degrees(np.abs(tilt_out) * (1 + 1 / out))
    return out, np.where(out > 0.05, angle, np.nan)


def sweet_spot(points, result, zone_centre):
    e, angle = result
    inside = e >= SWEET_REBOUND
    zone = (((points[:, 0] / ZONE[0])**2
             + ((points[:, 1] - zone_centre) / ZONE[1])**2) <= 1)
    # Off-centre test hit: 40 mm (about 1.6 in) beside the face centre.
    probe = np.argmin(np.hypot(points[:, 0] - 40.0, points[:, 1] - zone_centre))
    return dict(best=float(np.nanmax(e)),
                best_at=points[np.nanargmax(e)].tolist(),
                area_cm2=float(inside.sum() * GRID**2 / 100),
                length_mm=float(np.ptp(points[inside, 1]) + GRID) if inside.any() else 0.0,
                width_mm=float(np.ptp(points[inside, 0]) + GRID) if inside.any() else 0.0,
                zone_mean=float(np.nanmean(e[zone])),
                offcentre_rebound=float(e[probe]),
                offcentre_deg=float(angle[probe]),
                zone_max_deg=float(np.nanmax(angle[zone])))


def face_centre(outline, shape):
    """y of the area centre of the face above the neck."""
    face = outline ^ gp.CrossSection.square((1000, 1000)).translate(
        (-500, shape["handle"]))
    v, f, _ = moments(gp.Manifold.extrude(face, 1.0))
    return f[1] / v


def analyze(shape_name, pattern, wall=gp.uniform_wall, side_pad=None,
            contact_times=CONTACT_TIMES, keep_maps=False):
    shape = gp.SHAPES[shape_name]
    solid = gp.build(shape, flat_bottom=False, pattern=pattern, wall=wall,
                     side_pad=side_pad)
    side_pad = shape["side_pad"] if side_pad is None else side_pad
    out = dict(shape=shape_name, pattern=pattern, side_pad=side_pad,
               **weight_metrics(solid, shape))
    g, rigid, face_target, master, region_p, throat_p = build_grillage(
        shape, pattern, wall, solid, side_pad)
    k_red, m_red, t, scale = assemble(g, rigid, face_target, master)
    freqs, vecs = modes(k_red, m_red)
    flexible = freqs[freqs > 1.0]
    w = (t @ vecs)[0::3]
    xy = np.array(g.xy)
    face = xy[:, 1] > shape["handle"] + 30
    # Twisting modes move the two sides in opposite directions.
    side = np.sign(np.round(xy[face, 0], 3))
    anti = [abs(np.sum(w[face, k] * side)) > abs(np.sum(w[face, k]))
            for k in range(len(freqs))]
    out.update(
        nodes=len(g.xy), mass_scale=scale,
        bend_hz=float(next(f for f, a in zip(freqs, anti) if f > 1 and not a)),
        twist_hz=float(next(f for f, a in zip(freqs, anti) if f > 1 and a)),
        modes_hz=[round(float(f), 1) for f in flexible[:8]])
    outline = gp.face_outline(shape)
    pts = impact_points(region_p, throat_p, outline)
    centre = face_centre(outline, shape)
    out.update(face_centre_mm=centre, impacts={}, rigid={})
    maps = {}
    for tau in contact_times:
        key = f"{tau * 1000:g}ms"
        res = rebound(pts, g, t, freqs, vecs, tau)
        out["impacts"][key] = sweet_spot(pts, res, centre)
        out["rigid"][key] = sweet_spot(
            pts, rebound(pts, g, t, freqs, vecs, tau, rigid_only=True), centre)
        maps[key] = dict(rebound=np.round(res[0], 4).tolist(),
                         angle=np.round(res[1], 2).tolist())
    if keep_maps:
        out["points"] = pts.tolist()
        out["rebound"] = maps
    return out


def summary(results):
    keys = list(results[0]["impacts"])
    mid = keys[len(keys) // 2]
    print(f"{'design':22s} {'g':>6s} {'bal':>5s} {'SW':>6s} {'TW':>5s} "
          f"{'COP':>5s} {'bend':>5s} {'twist':>5s} | sweet cm2 "
          f"{'/'.join(keys):>14s} | zone {mid} | off-centre deg {'/'.join(keys)}")
    for r in results:
        name = r["pattern"] + (f" +{r['side_pad']:g}mm pads" if r["side_pad"] else "")
        areas = "/".join(f"{r['impacts'][k]['area_cm2']:.0f}" for k in keys)
        degs = "/".join(f"{r['impacts'][k]['offcentre_deg']:.1f}" for k in keys)
        print(f"{name:22s} {r['mass_g']:6.1f} {r['balance_mm']:5.0f} "
              f"{r['swing_weight']:6.1f} {r['twist_weight']:5.2f} "
              f"{r['cop_mm']:5.0f} {r['bend_hz']:5.0f} {r['twist_hz']:5.0f} | "
              f"{areas:>24s} | {r['impacts'][mid]['zone_mean']:9.3f} | {degs}")


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--shape", choices=list(gp.SHAPES), default="elongated")
    ap.add_argument("--pattern", nargs="+", default=list(gp.PATTERNS),
                    choices=gp.PATTERNS)
    ap.add_argument("--wall", type=float, default=gp.WALL,
                    help="lattice wall thickness (mm)")
    ap.add_argument("--side-pad", type=float,
                    help="extra rim width (mm) along the straight sides; "
                         "defaults to the shape's own")
    ap.add_argument("--json")
    args = ap.parse_args()
    gp.WALL = args.wall
    results = [analyze(args.shape, p, side_pad=args.side_pad,
                       keep_maps=bool(args.json)) for p in args.pattern]
    summary(results)
    if args.json:
        with open(args.json, "w") as fh:
            json.dump(results, fh)


if __name__ == "__main__":
    main()
