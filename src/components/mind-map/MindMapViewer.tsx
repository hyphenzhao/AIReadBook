"use client";

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { ZoomIn, ZoomOut } from "lucide-react";
import type { MindMapNode } from "@/stores/knowledge-store";

interface MindMapViewerProps {
  data: MindMapNode;
  title: string;
  editable?: boolean;
  onNodeClick?: (node: MindMapNode) => void;
}

export function MindMapViewer({ data, title, editable, onNodeClick }: MindMapViewerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    function resize() {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: Math.max(600, window.innerHeight - 200),
        });
      }
    }
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    if (!svgRef.current || !data) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const { width, height } = dimensions;
    const margin = { top: 40, right: 120, left: 120, bottom: 40 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Create hierarchy and tree layout
    const root: any = d3.hierarchy(data);
    const treeLayout = (d3.tree() as any).size([innerWidth, innerHeight]);
    treeLayout(root);

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Links
    g.append("g")
      .attr("fill", "none")
      .attr("stroke", "var(--border)")
      .attr("stroke-width", 1.5)
      .selectAll("path")
      .data(root.links())
      .join("path")
      .attr(
        "d",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        d3
          .linkHorizontal()
          .x((d: any) => d.y)
          .y((d: any) => d.x) as any,
      );

    // Nodes
    const node = g
      .append("g")
      .selectAll("g")
      .data(root.descendants())
      .join("g")
      .attr("transform", (d: any) => `translate(${d.y},${d.x})`)
      .style("cursor", onNodeClick ? "pointer" : "default")
      .on("click", (_event: any, d: any) => {
        if (onNodeClick) onNodeClick(d.data);
      });

    // Node circles
    node
      .append("circle")
      .attr("r", (d: any) => (d.depth === 0 ? 8 : 5))
      .attr("fill", (d: any) =>
        d.depth === 0
          ? "var(--primary)"
          : d.children
            ? "var(--primary)"
            : "var(--muted-foreground)",
      );

    // Node labels
    node
      .append("text")
      .attr("dy", (d: any) => (d.children ? -12 : 15))
      .attr("text-anchor", "middle")
      .attr("font-size", (d: any) => (d.depth === 0 ? "14px" : d.depth === 1 ? "12px" : "11px"))
      .attr("font-weight", (d: any) => (d.depth <= 1 ? "600" : "400"))
      .attr("fill", "var(--foreground)")
      .text((d: any) => d.data.label)
      .each(function (d: any) {
        if (d.data.label.length > 20) {
          const el = d3.select(this);
          const text = d.data.label;
          el.text("");
          el.append("tspan").attr("x", 0).attr("dy", "-0.3em").text(text.slice(0, 20));
          el.append("tspan").attr("x", 0).attr("dy", "1.2em").text(text.slice(20));
        }
      });

    // Zoom behavior
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });
    zoomRef.current = zoom;

    svg.call(zoom);

    // Center the view
    const initialTransform = d3.zoomIdentity.translate(margin.left, margin.top);
    svg.call(zoom.transform, initialTransform);
  }, [data, dimensions, onNodeClick]);

  function handleZoom(factor: number) {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const zoom = zoomRef.current;
    if (!zoom) return;
    svg.transition().duration(300).call(zoom.scaleBy, factor);
  }

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Controls */}
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold">{title}</h3>
        <div className="flex gap-1">
          <button
            onClick={() => handleZoom(1.3)}
            className="rounded p-1 hover:bg-[var(--accent)]"
            title="放大"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            onClick={() => handleZoom(0.7)}
            className="rounded p-1 hover:bg-[var(--accent)]"
            title="缩小"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)]">
        <svg
          ref={svgRef}
          width={dimensions.width}
          height={dimensions.height}
          className="w-full"
        />
      </div>

      {editable && (
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          拖拽移动 • 滚轮缩放 • 点击节点查看详情
        </p>
      )}
    </div>
  );
}
