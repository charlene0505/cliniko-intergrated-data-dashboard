"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import basemap from "@/lib/geo/sydney-basemap.json";
import type { PostcodePoint } from "@/lib/patient-geo";
import { useCachedFetch } from "@/lib/use-cached-fetch";
import { useScrollReveal } from "@/lib/use-scroll-reveal";
import { cardNoBg } from "./ui";

interface GeoResponse {
  status: "ok" | "no_data";
  points?: PostcodePoint[];
  clinics?: { label: string; lng: number; lat: number }[];
  mappedPatients?: number;
  unmappedPatients?: number;
}

const { view } = basemap;

// Circle *area* is proportional to patient count (radius grows with the square root) — scaling the
// radius directly would make the busiest postcodes look quadratically bigger than they are.
// Radii are in map units; the map is 1000 units wide.
const MAX_RADIUS = 38;
const MIN_RADIUS = 2.5;
// One series, so one hue: the brand teal as a translucent fill (overlaps in the inner suburbs stay
// readable), outlined in the brand's dark teal. The fill alone is under 3:1 against the page and the
// land; the outline clears it, so every circle's edge stays visible.
const CIRCLE_FILL = "#14a3a8";
const CIRCLE_OUTLINE = "#fafafa";
const PAGE = "#fafafa";
const INK = "#1a1a1a";
// Small outer-suburb circles are a few pixels across, so hovering picks the nearest centre within
// this many map units rather than requiring the pointer to land on the circle itself.
const HOVER_SLOP = 16;
const MAP_ASPECT = view.height / view.width;
const MIN_VIEW_WIDTH = 260;
const REFERENCE_CANVAS_WIDTH = 720;
const DEFAULT_VIEW = { x: 380, y: 211, width: 600, height: 600 * MAP_ASPECT };

function clampView(next: typeof DEFAULT_VIEW) {
  const width = Math.min(view.width, Math.max(MIN_VIEW_WIDTH, next.width));
  const height = width * MAP_ASPECT;
  return {
    x: Math.min(view.width - width, Math.max(0, next.x)),
    y: Math.min(view.height - height, Math.max(0, next.y)),
    width,
    height,
  };
}

function defaultViewForCanvas(canvasWidth: number) {
  const width = DEFAULT_VIEW.width * (canvasWidth / REFERENCE_CANVAS_WIDTH);
  const height = width * MAP_ASPECT;
  const centreX = DEFAULT_VIEW.x + DEFAULT_VIEW.width / 2;
  const centreY = DEFAULT_VIEW.y + DEFAULT_VIEW.height / 2;
  return clampView({ x: centreX - width / 2, y: centreY - height / 2, width, height });
}

// Same equirectangular projection the basemap outline was built with (see build-postcode-geo.mjs).
function project(lng: number, lat: number) {
  return { x: (lng - view.minLng) * view.cosMid * view.k, y: (view.maxLat - lat) * view.k };
}

function inView({ x, y }: { x: number; y: number }) {
  return x >= 0 && y >= 0 && x <= view.width && y <= view.height;
}

// Largest 1 / 2 / 5 × 10ⁿ at or below n, for legend values that read as round numbers.
function niceFloor(n: number) {
  const power = 10 ** Math.floor(Math.log10(n));
  const m = n / power;
  return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * power;
}

export function PatientMapPanel({ fillHeight = false }: { fillHeight?: boolean }) {
  const { data } = useCachedFetch<GeoResponse>("patient-geo", "/api/cliniko/patient-geo");
  const [mapRef, entered] = useScrollReveal<HTMLDivElement>();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [mapView, setMapView] = useState(DEFAULT_VIEW);
  const [canvasWidth, setCanvasWidth] = useState(REFERENCE_CANVAS_WIDTH);
  const [dragging, setDragging] = useState(false);

  const { circles, clinics, legend, outsideMap } = useMemo(() => {
    const points = data?.points ?? [];
    const max = Math.max(1, ...points.map((p) => p.patients));
    const radius = (patients: number) => Math.max(MIN_RADIUS, Math.sqrt(patients / max) * MAX_RADIUS);

    const projected = points.map((p) => ({ ...p, ...project(p.lng, p.lat), r: radius(p.patients) }));
    // Largest first, so smaller postcodes are drawn on top and stay visible.
    const circles = projected.filter(inView).sort((a, b) => b.r - a.r);
    const outsideMap = projected.filter((c) => !inView(c)).reduce((sum, c) => sum + c.patients, 0);

    const legend = [...new Set([niceFloor(max), niceFloor(max / 5), niceFloor(max / 25)])]
      .filter((value) => value >= 1)
      .map((value) => ({ value, r: radius(value) }));

    const clinics = (data?.clinics ?? []).map((c) => ({ ...c, ...project(c.lng, c.lat) }));
    return { circles, clinics, legend, outsideMap };
  }, [data]);

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return;
    const pointer = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    let nearest: string | null = null;
    let nearestDistance = Infinity;
    for (const c of circles) {
      const d = Math.hypot(c.x - pointer.x, c.y - pointer.y);
      if (d <= Math.max(c.r, HOVER_SLOP) && d < nearestDistance) {
        nearest = c.postcode;
        nearestDistance = d;
      }
    }
    setHovered(nearest);
  };

  const hoveredCircle = hovered ? circles.find((c) => c.postcode === hovered) : undefined;
  const mapped = data?.mappedPatients ?? 0;
  const unmapped = data?.unmappedPatients ?? 0;

  // SVG units get larger on screen as the viewBox narrows. Scaling clinic annotations in the
  // opposite direction keeps them at a steady visual size while their anchor follows the map.
  const textScale = mapView.width / canvasWidth;

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    let previousWidth = REFERENCE_CANVAS_WIDTH;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      if (!width) return;
      setCanvasWidth(width);
      setMapView((current) => {
        const ratio = width / previousWidth;
        previousWidth = width;
        const nextWidth = current.width * ratio;
        const nextHeight = nextWidth * MAP_ASPECT;
        return clampView({
          x: current.x + (current.width - nextWidth) / 2,
          y: current.y + (current.height - nextHeight) / 2,
          width: nextWidth,
          height: nextHeight,
        });
      });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [data?.status]);

  const zoom = useCallback((factor: number, clientX?: number, clientY?: number) => {
    const ctm = svgRef.current?.getScreenCTM();
    const pointer = ctm && clientX !== undefined && clientY !== undefined
      ? new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse())
      : null;
    setMapView((current) => {
      const px = pointer ? (pointer.x - current.x) / current.width : 0.5;
      const py = pointer ? (pointer.y - current.y) / current.height : 0.5;
      const width = current.width * factor;
      const height = width * MAP_ASPECT;
      return clampView({
        x: current.x + px * (current.width - width),
        y: current.y + py * (current.height - height),
        width,
        height,
      });
    });
  }, []);

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    dragRef.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    setHovered(null);
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(false);
  }

  return (
    <section
      className={`${cardNoBg} flex ${fillHeight ? "h-115 lg:absolute lg:inset-0 lg:h-auto" : "h-115"} flex-col gap-3 overflow-hidden`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold tracking-tight">
          Patient Locations
        </h2>
        {data?.status === "ok" && (
          <p className="text-xs text-black/55">
            {mapped.toLocaleString("en-AU")} patients by home postcode
            {outsideMap > 0 &&
              ` · ${outsideMap.toLocaleString("en-AU")} live outside this map`}
          </p>
        )}
      </div>

      {!data && (
        <p className="text-xs text-black/50">Loading patient postcodes…</p>
      )}
      {data?.status === "no_data" && (
        <p className="text-xs text-black/50">No patient data yet.</p>
      )}

      {data?.status === "ok" && (
        <>
          <div
            ref={(node) => {
              mapContainerRef.current = node;
              mapRef(node);
            }}
            className="relative min-h-0 w-full flex-1 overflow-hidden"
          >
            <svg
              ref={svgRef}
              viewBox={`${mapView.x} ${mapView.y} ${mapView.width} ${mapView.height}`}
              className={`block h-full w-full touch-none select-none ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
              preserveAspectRatio="xMidYMid slice"
              role="img"
              aria-label={`Map of Sydney with a circle per postcode sized by patient count. Largest: ${circles
                .slice(0, 3)
                .map(
                  (c) =>
                    `${c.postcode}${c.region ? ` (${c.region})` : ""} ${c.patients} patients`,
                )
                .join(", ")}.`}
              onPointerDown={onPointerDown}
              onPointerMove={(e) => {
                if (dragRef.current) {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const unitsPerPixel = Math.min(
                    mapView.width / rect.width,
                    mapView.height / rect.height,
                  );
                  const dx = (e.clientX - dragRef.current.x) * unitsPerPixel;
                  const dy = (e.clientY - dragRef.current.y) * unitsPerPixel;
                  dragRef.current = { x: e.clientX, y: e.clientY };
                  setMapView((current) =>
                    clampView({
                      ...current,
                      x: current.x - dx,
                      y: current.y - dy,
                    }),
                  );
                } else {
                  onPointerMove(e);
                }
              }}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onPointerLeave={() => {
                if (!dragRef.current) setHovered(null);
              }}
            >
              {/* Postal areas as a faint land mesh — water is simply the page showing through. */}
              <path
                d={basemap.path}
                fill="#ebe8e1"
                stroke={PAGE}
                strokeWidth={1.2}
                strokeLinejoin="round"
              />

              {circles.map((c) => {
                const isHovered = c.postcode === hovered;
                return (
                  <circle
                    key={c.postcode}
                    cx={c.x}
                    cy={c.y}
                    r={c.r}
                    fill={CIRCLE_FILL}
                    fillOpacity={isHovered ? 0.85 : 0.5}
                    stroke={isHovered ? INK : CIRCLE_OUTLINE}
                    strokeWidth={isHovered ? 1.5 : 1.2}
                    style={{
                      transformBox: "fill-box",
                      transformOrigin: "center",
                      transform: entered ? "scale(1)" : "scale(0)",
                      transition: "transform 700ms ease-out",
                    }}
                  />
                );
              })}

              {clinics.map((c) => (
                <g
                  key={c.label}
                  transform={`translate(${c.x} ${c.y}) scale(${textScale})`}
                >
                  <rect
                    x={-5}
                    y={-5}
                    width={10}
                    height={10}
                    rx={2}
                    fill={INK}
                    stroke={PAGE}
                    strokeWidth={2}
                  />
                  <text
                    x={9}
                    y={4}
                    fontSize={10}
                    fontWeight={400}
                    fill={INK}
                    stroke={PAGE}
                    strokeWidth={6}
                    paintOrder="stroke"
                  >
                    {c.label} clinic
                  </text>
                </g>
              ))}
            </svg>

            <div className="absolute right-2 top-2 z-20 flex overflow-hidden rounded-lg border border-black/10 bg-white/95 shadow-sm">
              <button
                type="button"
                onClick={() => zoom(0.75)}
                className="h-8 w-8 text-lg font-semibold hover:bg-black/5"
                aria-label="Zoom in"
              >
                +
              </button>
              <button
                type="button"
                onClick={() => zoom(1.33)}
                className="h-8 w-8 border-l border-black/10 text-lg font-semibold hover:bg-black/5"
                aria-label="Zoom out"
              >
                −
              </button>
              <button
                type="button"
                onClick={() => setMapView(defaultViewForCanvas(canvasWidth))}
                className="h-8 border-l border-black/10 px-2 text-[10px] font-semibold uppercase tracking-wide hover:bg-black/5"
                aria-label="Reset map view"
              >
                Reset
              </button>
            </div>

            <div
              className="pointer-events-none absolute bottom-2 right-2 z-20 min-w-24 rounded-lg border border-black/10 bg-white/90 px-3 py-2 text-ink shadow-sm"
              aria-hidden="true"
            >
              <p className="mb-1.5 text-xs font-semibold">Patients</p>
              <div className="flex flex-col gap-1">
                {legend.map((item, index) => {
                  const diameter = Math.max(5, 20 - index * 6);
                  return (
                    <div
                      key={item.value}
                      className="flex items-center gap-2 text-[11px] tabular-nums text-black/65"
                    >
                      <span className="flex w-5 items-center justify-center">
                        <span
                          className="block rounded-full border border-black/25 bg-teal-500/50"
                          style={{ width: diameter, height: diameter }}
                        />
                      </span>
                      <span>{item.value.toLocaleString("en-AU")}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {hoveredCircle && (
              <div
                className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-black/80 px-2.5 py-1.5 text-xs text-white"
                style={{
                  left: `${((hoveredCircle.x - mapView.x) / mapView.width) * 100}%`,
                  top: `calc(${((hoveredCircle.y - hoveredCircle.r - mapView.y) / mapView.height) * 100}% - 6px)`,
                }}
              >
                <strong className="block text-sm font-semibold">
                  {hoveredCircle.patients.toLocaleString("en-AU")} patients
                </strong>
                <span className="text-white/75">
                  {hoveredCircle.postcode}
                  {hoveredCircle.region ? ` · ${hoveredCircle.region}` : ""}
                </span>
              </div>
            )}
          </div>

          {/* The table twin of the map, for screen readers — every value the circles and tooltip show. */}
          <div className="sr-only">
            <table>
              <caption>Patients by home postcode</caption>
              <thead>
                <tr>
                  <th scope="col">Postcode</th>
                  <th scope="col">Region</th>
                  <th scope="col">Patients</th>
                </tr>
              </thead>
              <tbody>
                {(data.points ?? []).map((p) => (
                  <tr key={p.postcode}>
                    <td>{p.postcode}</td>
                    <td>{p.region ?? "—"}</td>
                    <td>{p.patients}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[10.5px] leading-snug text-black/45">
            Each circle sits at the centre of a postal area; clinic markers sit
            at the centre of their own postcode. {basemap.attribution}.
          </p>
        </>
      )}
    </section>
  );
}
