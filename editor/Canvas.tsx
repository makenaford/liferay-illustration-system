import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { buildDocument } from '../src/render.ts';
import { toReact, resetKeys } from './toReact.tsx';
import {
  commit,
  elementAt,
  getState,
  replaceAt,
  setUI,
  useEditor,
} from './state.ts';
import { isResizable, movedDeep, resizedTo } from './geometry.ts';
import { boundsOf, safeArea, type Box } from './bounds.ts';
import { snap } from './grid.ts';
import { contentBox } from './layout.ts';
import { alignmentSnap, edgeSnap, type Guide, type Target } from './guides.ts';
import { isContainer as isContainerEl, resolveLayout } from '../src/autolayout.ts';
import { parentOf } from './state.ts';
import { useFileDrop } from './useFileDrop.ts';
import { toggleSelect } from './grouping.ts';
import { InlineText, textTargetAt, type TextTarget } from './InlineText.tsx';
import { moveTo, planDrop, type DropPlan } from './reparent.ts';
import type { Element as DocElement } from '../src/document.ts';
import { scaleOf, valueAt, withValue, type ChartScale } from './chartEdit.ts';
import { linePoints } from '../src/primitives/lineChart.ts';
import { barGeometry } from '../src/primitives/barChart.ts';
import type { BarChartEl, LineChartEl } from '../src/document.ts';

type DragMode =
  | { kind: 'move' }
  | { kind: 'resize'; corner: 'se' | 'sw' | 'ne' | 'nw' }
  | { kind: 'pan' }
  /** Dragging one chart value; the plot box and scale are fixed at the start. */
  | { kind: 'chart'; series: number; index: number; scale: ChartScale; top: number; height: number };

export function Canvas() {
  const doc = useEditor((s) => s.doc);
  const theme = useEditor((s) => s.theme);
  const selected = useEditor((s) => s.selected);
  const also = useEditor((s) => s.also);
  const zoom = useEditor((s) => s.zoom);
  const pan = useEditor((s) => s.pan);
  const outlines = useEditor((s) => s.showOutlines);
  const snapStep = useEditor((s) => s.snapStep);
  const showGrid = useEditor((s) => s.showGrid);
  const padding = useEditor((s) => s.padding);
  const smartGuides = useEditor((s) => s.smartGuides);
  const lockAspect = useEditor((s) => s.lockAspect);

  const docRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  /** Words being typed into on the canvas — see InlineText. */
  const [editingText, setEditingText] = useState<TextTarget | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const drag = useRef<{
    mode: DragMode;
    startX: number;
    startY: number;
    origin: Box | null;
    moved: boolean;
    /** Boxes the drag can align to. Collected once, on pointer down. */
    targets: Target[];
    /**
     * Pressed on a child of the already-selected group: the press drags the
     * group, and only a release without moving goes in to this child.
     */
    dive?: string;
    /**
     * A child of an auto-layout container: its position is the flow's, so the
     * drag moves a ghost and only the drop changes the document.
     */
    auto?: boolean;
    /** The element as drawn when the drag began, and its box then. */
    startEl?: DocElement;
    startBox?: Box;
  } | null>(null);

  /** Where the current drag would land, if that changes anything. */
  const [dropPlan, setDropPlan] = useState<DropPlan | null>(null);
  const planRef = useRef<DropPlan | null>(null);
  const [ghost, setGhost] = useState<Box | null>(null);

  /*
   * Auto-layout containers compute their children's coordinates, so the
   * editor measures and hit-tests against the RESOLVED document. Without
   * this the selection box would land on the stale coordinates still sitting
   * in the source document rather than on where the element actually is.
   */
  const resolved = useMemo(() => resolveLayout(doc), [doc]);

  /**
   * What a drag can align to: its siblings, the box that contains it, and
   * the artboard. Siblings are what a designer is usually lining up with, so
   * the container and the artboard are weighted slightly weaker and only win
   * when nothing else is close.
   */
  const alignTargets = (path: string): Target[] => {
    const art = doc.artboard ?? doc.canvas;
    const parent = parentOf(path);
    const container = parent ? elementAt(resolved, parent) : null;
    const siblings = (
      container
        ? ((container as { children?: typeof resolved.elements }).children ?? [])
        : resolved.elements
    ) as typeof resolved.elements;

    const out: Target[] = [];
    siblings.forEach((el, i) => {
      const sibPath = parent ? `${parent}.${i}` : String(i);
      if (sibPath === path) return;
      const node = docRef.current?.querySelector<SVGGraphicsElement>(
        `[data-path="${sibPath}"]`,
      );
      const b = boundsOf(el, node ?? null);
      if (b && b.width > 0 && b.height > 0) out.push({ box: b, weight: 0 });
    });

    if (container) {
      const b = boundsOf(container, null);
      if (b) out.push({ box: b, weight: 0.75 });
    }
    out.push({ box: { x: 0, y: 0, width: art.width, height: art.height }, weight: 0.75 });
    // Top-level elements can also line up with the safe area's edge, which
    // is the one they are most often being pushed toward.
    if (!container) out.push({ box: safeArea(doc), weight: 0.75 });
    return out;
  };

  /**
   * What a click on `deepest` selects. Inside a group made with ⌘G — a group
   * with no auto-layout — the first click takes the whole group, so dragging
   * it moves everything in it; clicking again (or double-clicking) goes in to
   * the element itself. Figma's rule. Auto-layout groups are rows and columns
   * inside cards, not things anyone grouped, so they keep direct selection.
   *
   * Pressing on a child of the group that is ALREADY selected still grabs the
   * group — that press is usually the start of a drag. `dive` is where a
   * release without movement goes instead.
   */
  const pickTarget = (
    deepest: string | null,
    doubleClick: boolean,
  ): { path: string | null; dive?: string } => {
    if (!deepest || doubleClick) return { path: deepest };
    let outer: string | null = null;
    for (let p = parentOf(deepest); p; p = parentOf(p)) {
      const el = elementAt(doc, p);
      if (el?.type === 'group' && !el.layout) outer = p;
    }
    if (!outer) return { path: deepest };
    const sel = getState().selected;
    // Already working inside the group: clicks go straight to what was hit.
    if (sel?.startsWith(`${outer}.`)) return { path: deepest };
    return sel === outer ? { path: outer, dive: deepest } : { path: outer };
  };

  /** True when this element's position is computed by a parent container. */
  const isAutoPlaced = (path: string | null) => {
    if (!path) return false;
    const parent = parentOf(path);
    if (!parent) return false;
    const p = elementAt(doc, parent);
    return !!(p && isContainerEl(p) && p.layout);
  };

  const tree = useMemo(() => {
    resetKeys();
    // The editor works in ARTBOARD space: elements, grid, selection and drag
    // all share one coordinate system, and only the export scales. So the
    // preview is built as if the artboard were the canvas.
    const art = doc.artboard ?? doc.canvas;
    return toReact(
      buildDocument({ ...doc, canvas: art, artboard: undefined }, theme, { annotate: true }),
    );
  }, [doc, theme]);

  /* Selection box is re-measured after every render that could change it. */
  useLayoutEffect(() => {
    if (!selected) {
      setBox(null);
      return;
    }
    const el = elementAt(resolved, selected);
    if (!el) {
      setBox(null);
      return;
    }
    const node = docRef.current?.querySelector<SVGGraphicsElement>(
      `[data-path="${selected}"]`,
    );
    setBox(boundsOf(el, node ?? null));
  }, [selected, resolved, theme, zoom]);

  /* The rest of a multi-selection, drawn without handles. */
  const [alsoBoxes, setAlsoBoxes] = useState<Box[]>([]);
  useLayoutEffect(() => {
    setAlsoBoxes(
      also
        .map((p) => {
          const el = elementAt(resolved, p);
          const node = docRef.current?.querySelector<SVGGraphicsElement>(`[data-path="${p}"]`);
          return el ? boundsOf(el, node ?? null) : null;
        })
        .filter((b): b is Box => !!b),
    );
  }, [also, resolved, theme, zoom]);

  const onPointerDown = (e: React.PointerEvent) => {
    // Middle-drag or space-drag pans.
    if (e.button === 1 || e.altKey) {
      drag.current = { mode: { kind: 'pan' }, startX: e.clientX, startY: e.clientY, origin: null, moved: false, targets: [] };
      (e.target as Element).setPointerCapture?.(e.pointerId);
      return;
    }
    if (e.button !== 0) return;

    const target = e.target as HTMLElement;

    // A chart value handle: drag it up or down to change that one value.
    const point = target.closest<SVGElement>('[data-chart]');
    if (point && selected) {
      const el = elementAt(resolved, selected);
      const scale = el ? scaleOf(el) : null;
      if (el && scale && (el.type === 'lineChart' || el.type === 'barChart')) {
        const [series, index] = (point.dataset.chart ?? '0:0').split(':').map(Number);
        drag.current = {
          mode: { kind: 'chart', series, index, scale, top: el.y, height: el.height },
          startX: e.clientX,
          startY: e.clientY,
          origin: null,
          moved: false,
          targets: [],
        };
        (e.target as Element).setPointerCapture?.(e.pointerId);
        return;
      }
    }

    const handle = target.closest<HTMLElement>('[data-handle]');
    if (handle && box) {
      drag.current = {
        mode: { kind: 'resize', corner: handle.dataset.handle as 'se' },
        startX: e.clientX,
        startY: e.clientY,
        origin: box,
        moved: false,
        targets: selected ? alignTargets(selected) : [],
      };
      return;
    }

    const deepest = target.closest<SVGGraphicsElement>('[data-path]');
    const { path, dive } = pickTarget(deepest?.getAttribute('data-path') ?? null, e.detail >= 2);
    const hit = path
      ? docRef.current?.querySelector<SVGGraphicsElement>(`[data-path="${path}"]`) ?? null
      : null;
    // Shift-click builds a multi-selection for grouping; it never drags.
    if (e.shiftKey && path) {
      toggleSelect(path);
      return;
    }
    setUI({ selected: path });

    // A child of an auto-layout container is dragged as a ghost: dropping it
    // reorders the flow, or takes it out of the card.
    if (path) {
      const el = elementAt(resolved, path);
      const origin = el ? boundsOf(el, hit ?? null) : null;
      drag.current = {
        mode: { kind: 'move' },
        startX: e.clientX,
        startY: e.clientY,
        origin,
        moved: false,
        targets: alignTargets(path),
        dive,
        auto: isAutoPlaced(path),
        startEl: el ?? undefined,
        startBox: origin ? { ...origin } : undefined,
      };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / zoom;
    const dy = (e.clientY - d.startY) / zoom;

    if (d.mode.kind === 'chart') {
      const st = getState();
      const el = st.selected ? elementAt(st.doc, st.selected) : null;
      const rect = stageRef.current?.getBoundingClientRect();
      if (!el || !rect || (el.type !== 'lineChart' && el.type !== 'barChart')) return;
      const { series, index, scale, top, height } = d.mode;
      // Measured against the RESOLVED plot box captured at the start, since a
      // chart inside auto-layout does not sit at its stored y.
      const y = (e.clientY - rect.top) / zoom;
      const v = valueAt({ ...el, y: top, height } as LineChartEl, scale, y);
      commit(replaceAt(st.doc, st.selected!, withValue(el, scale, series, index, v)), d.moved);
      d.moved = true;
      return;
    }

    if (d.mode.kind === 'pan') {
      setUI({
        pan: {
          x: pan.x + (e.clientX - d.startX),
          y: pan.y + (e.clientY - d.startY),
        },
      });
      d.startX = e.clientX;
      d.startY = e.clientY;
      return;
    }

    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && !d.moved) return;

    const st = getState();
    if (!st.selected) return;
    const el = elementAt(st.doc, st.selected);
    if (!el) return;

    if (d.mode.kind === 'move') {
      /*
       * Snap the DESTINATION, not the delta. Snapping the delta preserves
       * whatever off-grid offset the element started with, so nothing ever
       * converges onto the grid; snapping where it lands is what pulls a
       * document into alignment as you work it. Shift bypasses snapping.
       */
      const origin = d.origin;
      let sx = dx;
      let sy = dy;
      let hits: Guide[] = [];

      /*
       * Alignment beats the grid. A guide is only offered within a few
       * screen pixels, and when one is showing it is the thing the designer
       * is aiming at — snapping to the grid instead would land the element
       * one or two pixels off the line it is visibly touching.
       */
      if (!e.shiftKey && smartGuides && origin) {
        const at = { ...origin, x: origin.x + dx, y: origin.y + dy };
        const a = alignmentSnap(at, d.targets, 5 / zoom);
        if (a.guides.length) {
          hits = a.guides;
          if (a.dx !== 0 || a.guides.some((g) => g.axis === 'x')) sx = dx + a.dx;
          if (a.dy !== 0 || a.guides.some((g) => g.axis === 'y')) sy = dy + a.dy;
        }
      }

      const snappedX = hits.some((g) => g.axis === 'x');
      const snappedY = hits.some((g) => g.axis === 'y');
      if (!e.shiftKey && snapStep > 0 && origin) {
        if (!snappedX) sx = snap(origin.x + dx, snapStep) - origin.x;
        if (!snappedY) sy = snap(origin.y + dy, snapStep) - origin.y;
      } else if (!e.shiftKey) {
        if (!snappedX) sx = Math.round(dx);
        if (!snappedY) sy = Math.round(dy);
      }
      setGuides(hits);
      if (sx === 0 && sy === 0 && !d.moved) return;
      if (!d.auto) commit(replaceAt(st.doc, st.selected, movedDeep(el, sx, sy)), d.moved);
      if (origin) {
        origin.x += sx;
        origin.y += sy;
        if (d.auto) setGhost({ ...origin });
        // Where it would land. ⌘ holds it where it is structurally.
        const rect = stageRef.current?.getBoundingClientRect();
        const plan =
          e.metaKey || !rect
            ? null
            : planDrop(st.doc, resolveLayout(st.doc), st.selected, origin, {
                x: (e.clientX - rect.left) / zoom,
                y: (e.clientY - rect.top) / zoom,
              });
        planRef.current = plan?.changes ? plan : null;
        setDropPlan(planRef.current);
      }
      d.startX += sx * zoom;
      d.startY += sy * zoom;
    } else if (d.origin && isResizable(el)) {
      const c = d.mode.corner;
      const hits: Guide[] = [];
      const movingX = c === 'se' || c === 'ne' ? 'right' : 'left';
      const movingY = c === 'se' || c === 'sw' ? 'bottom' : 'top';

      /*
       * Snap the resulting edge, for the same reason a move snaps its
       * destination — so widths land on the grid, not just change by it.
       * A neighbour's edge or centre wins over the grid, same as a move.
       *
       * Only the two edges the dragged corner actually moves are snapped;
       * running this over all four would draw guides for edges that are
       * standing still.
       */
      const fit = (edge: number, axis: 'x' | 'y', moving: boolean) => {
        if (e.shiftKey) return edge;
        if (moving && smartGuides && d.origin) {
          const span: readonly [number, number] =
            axis === 'x'
              ? [d.origin.y, d.origin.y + d.origin.height]
              : [d.origin.x, d.origin.x + d.origin.width];
          const a = edgeSnap(edge, d.targets, 5 / zoom, axis, span);
          if (a.guide) {
            hits.push(a.guide);
            return a.value;
          }
        }
        return snapStep <= 0 ? edge : snap(edge, snapStep);
      };

      const right = fit(d.origin.x + d.origin.width + dx, 'x', movingX === 'right');
      const left = fit(d.origin.x + dx, 'x', movingX === 'left');
      const bottom = fit(d.origin.y + d.origin.height + dy, 'y', movingY === 'bottom');
      const top = fit(d.origin.y + dy, 'y', movingY === 'top');
      /*
       * Resize around the corner that ISN'T moving.
       *
       * The anchor is the opposite corner, and it stays exactly where it was
       * for every handle — which is what makes dragging a north-west handle
       * behave like dragging a south-east one, and what lets the ratio lock
       * drop in without four separate cases.
       */
      const anchorX = movingX === 'right' ? d.origin.x : d.origin.x + d.origin.width;
      const anchorY = movingY === 'bottom' ? d.origin.y : d.origin.y + d.origin.height;
      let edgeX = movingX === 'right' ? right : left;
      let edgeY = movingY === 'bottom' ? bottom : top;

      let w = Math.abs(edgeX - anchorX);
      let h = Math.abs(edgeY - anchorY);

      /*
       * Ratio lock. ⌘/Ctrl inverts it for one drag, the way shift does for
       * snapping, so neither setting traps you.
       *
       * The axis that moved further — measured as a fraction of the original
       * size, not in pixels, so a wide short element doesn't always follow its
       * width — drives, and the other is derived. Deriving both from the
       * pointer would fight the constraint.
       */
      const locked = (lockAspect ? 1 : 0) ^ (e.metaKey || e.ctrlKey ? 1 : 0);
      if (locked && d.origin.width > 0 && d.origin.height > 0) {
        const aspect = d.origin.width / d.origin.height;
        if (Math.abs(w - d.origin.width) / d.origin.width >=
            Math.abs(h - d.origin.height) / d.origin.height) {
          h = w / aspect;
        } else {
          w = h * aspect;
        }
        // Re-place the moving edges so the anchor corner holds.
        edgeX = movingX === 'right' ? anchorX + w : anchorX - w;
        edgeY = movingY === 'bottom' ? anchorY + h : anchorY - h;
        // A derived edge was never snapped to, so its guide would be a lie.
        hits.length = 0;
      }

      let next = resizedTo(el, w, h);
      next = { ...next, x: Math.min(anchorX, edgeX), y: Math.min(anchorY, edgeY) } as typeof next;
      commit(replaceAt(st.doc, st.selected, next), d.moved);
      setGuides(hits);
    }
    d.moved = true;
  };

  const endDrag = () => {
    drag.current = null;
    planRef.current = null;
    setDropPlan(null);
    setGhost(null);
    setGuides([]);
  };

  const onPointerUp = () => {
    const d = drag.current;
    if (d?.dive && !d.moved) setUI({ selected: d.dive });

    // Dropped somewhere that changes where it belongs: move it there.
    const plan = planRef.current;
    const st = getState();
    if (d && d.mode.kind === 'move' && d.moved && plan && st.selected) {
      // A free element already sits where it was dragged. A flow child never
      // moved, so it is placed from where it was drawn plus the drag — which
      // matters when it leaves the flow and keeps that position.
      const el =
        d.auto && d.startEl && d.startBox && d.origin
          ? movedDeep(d.startEl, d.origin.x - d.startBox.x, d.origin.y - d.startBox.y)
          : elementAt(st.doc, st.selected);
      if (el) {
        const next = moveTo(st.doc, st.selected, el, plan.slot);
        commit(next.doc, !d.auto);
        setUI({ selected: next.path });
      }
    }
    endDrag();
  };

  // Leaving the viewport ends a drag but is not a click, so it never dives.
  const onPointerLeave = () => endDrag();

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const next = Math.min(6, Math.max(0.25, zoom * (1 - e.deltaY / 500)));
      setUI({ zoom: next });
    } else {
      setUI({ pan: { x: pan.x - e.deltaX, y: pan.y - e.deltaY } });
    }
  };

  /* Keyboard: nudge, delete, undo/redo live in App; this handles nudge. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = getState();
      if (!st.selected) return;
      if ((e.target as HTMLElement)?.matches('input, textarea, select')) return;
      const st2 = getState();
      const step = e.shiftKey ? 10 : Math.max(st2.snapStep, 1);
      const delta: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const d = delta[e.key];
      if (!d) return;
      const parent = parentOf(st.selected);
      const p = parent ? elementAt(st.doc, parent) : null;
      if (p && isContainerEl(p) && p.layout) return;
      e.preventDefault();
      const el = elementAt(st.doc, st.selected);
      if (el) commit(replaceAt(st.doc, st.selected, movedDeep(el, d[0], d[1])));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const { width, height } = doc.artboard ?? doc.canvas;
  const safe = safeArea(doc);

  /*
   * The drop target while dragging: the container it would land in, and in a
   * flow, a bar where it would be inserted. Nothing when the drop would leave
   * it where it is, so the highlight only appears when it means something.
   */
  const { dropBox, dropBar } = (() => {
    if (!dropPlan?.slot.parent) return { dropBox: null, dropBar: null };
    const c = elementAt(resolved, dropPlan.slot.parent) as DocElement & {
      x: number; y: number; width: number; height: number;
      layout?: { direction: 'vertical' | 'horizontal'; gap?: number };
      children?: DocElement[];
    } | null;
    if (!c) return { dropBox: null, dropBar: null };
    const box = { x: c.x, y: c.y, width: c.width, height: c.height };
    if (!c.layout) return { dropBox: box, dropBar: null };
    const kids = (c.children ?? []).map((k, i) => {
      const node = docRef.current?.querySelector<SVGGraphicsElement>(`[data-path="${dropPlan.slot.parent}.${i}"]`);
      return boundsOf(k, node ?? null);
    });
    const i = dropPlan.slot.index ?? kids.length;
    const gap = (c.layout.gap ?? 8) / 2;
    const vertical = c.layout.direction === 'vertical';
    const before = kids[i];
    const after = kids[i - 1];
    const at = before
      ? (vertical ? before.y : before.x) - gap
      : after
        ? (vertical ? after.y + after.height : after.x + after.width) + gap
        : vertical ? c.y + 12 : c.x + 12;
    const bar = vertical
      ? { x1: c.x + 6, x2: c.x + c.width - 6, y1: at, y2: at }
      : { x1: at, x2: at, y1: c.y + 6, y2: c.y + c.height - 6 };
    return { dropBox: box, dropBar: bar };
  })();

  /*
   * Value handles for the selected chart: a dot on every line point, a bar
   * on every bar top. Positions come from the primitives' own geometry, so
   * they sit exactly on what is drawn.
   */
  const chartHandles = (() => {
    const el = selected && !also.length ? elementAt(resolved, selected) : null;
    if (el?.type === 'lineChart') {
      return linePoints(el as LineChartEl).flatMap((pts, si) =>
        pts.map(([px, py], i) => (
          <circle
            key={`${si}:${i}`}
            data-chart={`${si}:${i}`}
            cx={px}
            cy={py}
            r={4 / zoom}
            className="chart-handle"
            strokeWidth={1.25 / zoom}
          >
            <title>{`Drag to change · ${(el as LineChartEl).series[si].data[i]}`}</title>
          </circle>
        )),
      );
    }
    if (el?.type === 'barChart') {
      const bars = barGeometry(el as BarChartEl);
      return bars.bars.map((b) => (
        <rect
          key={`${b.series}:${b.index}`}
          data-chart={`${b.series}:${b.index}`}
          x={b.x}
          y={b.y - 2.5 / zoom}
          width={Math.max(b.width, 6 / zoom)}
          height={5 / zoom}
          rx={1.5 / zoom}
          className="chart-handle"
          strokeWidth={1.25 / zoom}
        >
          <title>{`Drag to change · ${bars.series[b.series].data[b.index]}`}</title>
        </rect>
      ));
    }
    return null;
  })();
  const fileDrop = useFileDrop(stageRef, zoom, snapStep);
  const hs = 4 / zoom; // handles keep a constant on-screen size

  /*
   * The padding guide: when a card is selected, show the content box its
   * children should align to. It's the difference between "nudge until it
   * looks right" and "put it on the edge", and it's the same box the layout
   * actions in the inspector operate on.
   */
  const selectedEl = selected ? elementAt(resolved, selected) : null;
  const guide =
    selectedEl && isContainerEl(selectedEl)
      ? contentBox(
          selectedEl,
          selectedEl.layout && typeof selectedEl.layout.padding === 'number'
            ? selectedEl.layout.padding
            : padding,
        )
      : null;

  // Drawn as one <path> rather than hundreds of <line>s: the grid is redrawn
  // on every pan and zoom, and at step 2 on an 860pt canvas that is 600 nodes.
  const gridPath = (() => {
    if (!showGrid || snapStep <= 0) return null;
    // Keep the on-screen density sane when zoomed out.
    const step = snapStep * Math.max(1, Math.round(4 / (snapStep * zoom)));
    let d = '';
    for (let x = 0; x <= width; x += step) d += `M${x} 0V${height}`;
    for (let y = 0; y <= height; y += step) d += `M0 ${y}H${width}`;
    return d;
  })();

  return (
    <div
      className={`viewport${fileDrop.dropping ? ' dropping' : ''}`}
      {...fileDrop.handlers}
      onDoubleClick={(e) => {
        // Double-click words to type into them where they are.
        const t = textTargetAt(e.target as globalThis.Element);
        if (!t) return;
        setUI({ selected: t.path });
        setEditingText(t);
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      onWheel={onWheel}
    >
      <div
        className="stage"
        ref={stageRef}
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          width,
          height,
        }}
      >
        <div
          className={`doc${outlines ? ' outlines' : ''}${
            selected && isAutoPlaced(selected) ? ' auto-child' : ''
          }`}
          ref={docRef}
          style={{ width, height }}
        >
          {tree}
        </div>

        <svg
          className="overlay"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          {gridPath && (
            <path d={gridPath} className="grid-lines" strokeWidth={0.5 / zoom} />
          )}

          {/*
            * The safe area. The margin outside it is tinted rather than just
            * outlined, so a card that strays into it is obvious without
            * having to look for a line. It follows the Guides toggle, the
            * same as the snapping to it does.
            */}
          {smartGuides && (
            <>
              <path
                className="safe-area-margin"
                fillRule="evenodd"
                d={`M0 0H${width}V${height}H0Z M${safe.x} ${safe.y}V${safe.y + safe.height}H${
                  safe.x + safe.width
                }V${safe.y}Z`}
              />
              <rect
                x={safe.x}
                y={safe.y}
                width={safe.width}
                height={safe.height}
                className="safe-area"
                strokeWidth={1 / zoom}
                strokeDasharray={`${4 / zoom} ${4 / zoom}`}
              />
            </>
          )}

          {guide && (
            <rect
              x={guide.x}
              y={guide.y}
              width={guide.width}
              height={guide.height}
              className="pad-guide"
              strokeWidth={1 / zoom}
              strokeDasharray={`${3 / zoom} ${3 / zoom}`}
            />
          )}

          {/*
            * Alignment guides. Drawn under the selection so the handles stay
            * grabbable, and with a tick at each end so a line that runs off
            * the artboard still reads as a measurement rather than a border.
            */}
          {guides.map((g, i) => {
            const t = 3 / zoom;
            return (
              <g key={i} className={`align-guide${g.kind === 'center' ? ' center' : ''}`}>
                <line
                  x1={g.axis === 'x' ? g.at : g.from}
                  y1={g.axis === 'x' ? g.from : g.at}
                  x2={g.axis === 'x' ? g.at : g.to}
                  y2={g.axis === 'x' ? g.to : g.at}
                  strokeWidth={1 / zoom}
                  strokeDasharray={g.kind === 'center' ? `${4 / zoom} ${3 / zoom}` : undefined}
                />
                {[g.from, g.to].map((end, j) => (
                  <line
                    key={j}
                    x1={g.axis === 'x' ? g.at - t : end}
                    y1={g.axis === 'x' ? end : g.at - t}
                    x2={g.axis === 'x' ? g.at + t : end}
                    y2={g.axis === 'x' ? end : g.at + t}
                    strokeWidth={1 / zoom}
                  />
                ))}
              </g>
            );
          })}

          {dropBox && (
            <rect
              x={dropBox.x}
              y={dropBox.y}
              width={dropBox.width}
              height={dropBox.height}
              className="drop-target"
              strokeWidth={1.5 / zoom}
              strokeDasharray={`${4 / zoom} ${3 / zoom}`}
            />
          )}
          {dropBar && (
            <line {...dropBar} className="drop-bar" strokeWidth={3 / zoom} />
          )}
          {ghost && (
            <rect
              x={ghost.x}
              y={ghost.y}
              width={ghost.width}
              height={ghost.height}
              className="drag-ghost"
              strokeWidth={1 / zoom}
            />
          )}

          {chartHandles}

          {alsoBoxes.map((b, i) => (
            <rect
              key={i}
              x={b.x}
              y={b.y}
              width={b.width}
              height={b.height}
              className="sel-rect"
              strokeWidth={1 / zoom}
            />
          ))}

          {box && (
            <g>
              <rect
                x={box.x}
                y={box.y}
                width={box.width}
                height={box.height}
                className="sel-rect"
                strokeWidth={1 / zoom}
              />
              {(['nw', 'ne', 'sw', 'se'] as const).map((c) => {
                const cx = box.x + (c === 'ne' || c === 'se' ? box.width : 0);
                const cy = box.y + (c === 'sw' || c === 'se' ? box.height : 0);
                return (
                  <rect
                    key={c}
                    data-handle={c}
                    x={cx - hs}
                    y={cy - hs}
                    width={hs * 2}
                    height={hs * 2}
                    className="sel-handle"
                    strokeWidth={1 / zoom}
                  />
                );
              })}
            </g>
          )}
        </svg>

        {editingText && (
          <InlineText key={`${editingText.path}:${editingText.field}`} target={editingText} docRef={docRef} onDone={() => setEditingText(null)} />
        )}
      </div>

      {fileDrop.dropping && (
        <div className="drop-hint">Drop SVGs or images to place them here</div>
      )}
      {fileDrop.note && <div className="drop-note">{fileDrop.note}</div>}
    </div>
  );
}
