"use client";
import { code128Modules } from "@/lib/barcode";

/**
 * Code-barres Code 128 (vectoriel, scannable) rendu en SVG.
 * `value` : chaîne à encoder (ex. numéro de moteur/boîte).
 */
export function Barcode({
  value,
  height = 40,
  moduleWidth = 1.4,
  quiet = 10,
  className,
}: {
  value: string | number;
  height?: number;
  moduleWidth?: number;
  quiet?: number;
  className?: string;
}) {
  const v = String(value ?? "").trim();
  if (!v) return null;
  const { modules, total } = code128Modules(v);
  const unitW = total + quiet * 2;

  // Reconstruit les barres (indices pairs = barre, impairs = espace).
  const bars: { x: number; w: number }[] = [];
  let x = quiet;
  modules.forEach((w, i) => {
    if (i % 2 === 0) bars.push({ x, w });
    x += w;
  });

  return (
    <svg
      className={className}
      width={unitW * moduleWidth}
      height={height}
      viewBox={`0 0 ${unitW} ${height}`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      role="img"
      aria-label={`Code-barres ${v}`}
      style={{ maxWidth: "100%" }}
    >
      <rect x={0} y={0} width={unitW} height={height} fill="#ffffff" />
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.w} height={height} fill="#000000" />
      ))}
    </svg>
  );
}
