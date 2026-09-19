"use client";

import { useEffect, useRef } from "react";
import cytoscape, { type Core, type ElementDefinition } from "cytoscape";
import fcose from "cytoscape-fcose";

cytoscape.use(fcose);

export interface CanvasNode { id: string; label: string; type: string; weight: number }
export interface CanvasEdge {
  id: string; source: string; target: string; label: string; weight: number;
  tone?: "agree" | "contradict" | "neutral";
  /** False for symmetric relations (two papers sharing a method): no arrowhead. */
  directed?: boolean;
}

/** One colour per node type, readable on both light and dark backgrounds. */
export const TYPE_COLORS: Record<string, string> = {
  person: "#e0823d",
  concept: "#4f7cf0",
  place: "#2fa37a",
  event: "#d2475f",
  work: "#8b5cf6",
  argument: "#c59a1b",
  paper: "#334155",
  keyword: "#4f7cf0",
  method: "#2fa37a",
  dataset: "#0ea5b7",
  conclusion: "#d2475f",
};
const FALLBACK_COLOR = "#64748b";

interface Props {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  selectedId: string | null;
  onSelectNode: (id: string | null) => void;
  onSelectEdge?: (id: string) => void;
}

/**
 * Cytoscape, driven through a ref rather than a React wrapper. The graph is
 * rebuilt when its data changes; selection only restyles what is there.
 */
export function GraphCanvas({ nodes, edges, selectedId, onSelectNode, onSelectEdge }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  // Read through refs so the instance does not need rebuilding when handlers change.
  const handlers = useRef({ onSelectNode, onSelectEdge });
  handlers.current = { onSelectNode, onSelectEdge };

  useEffect(() => {
    if (!containerRef.current) return;
    const css = getComputedStyle(document.documentElement);
    const foreground = css.getPropertyValue("--foreground").trim() || "#111";
    const background = css.getPropertyValue("--background").trim() || "#fff";
    const muted = css.getPropertyValue("--muted-foreground").trim() || "#888";

    const maxWeight = Math.max(1, ...nodes.map((node) => node.weight));
    const elements: ElementDefinition[] = [
      ...nodes.map((node) => ({
        data: { ...node, color: TYPE_COLORS[node.type] ?? FALLBACK_COLOR, size: 18 + 34 * Math.sqrt(node.weight / maxWeight) },
      })),
      ...edges.map((edge) => ({
        data: { ...edge, width: Math.min(6, 1 + Math.log2(1 + edge.weight)) },
        classes: `${edge.tone ?? "neutral"}${edge.directed === false ? " undirected" : ""}`,
      })),
    ];

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      minZoom: 0.15,
      maxZoom: 3,
      wheelSensitivity: 0.25,
      // Keeps panning smooth on a few thousand elements.
      hideEdgesOnViewport: elements.length > 800,
      textureOnViewport: elements.length > 800,
      style: [
        {
          selector: "node",
          style: {
            "background-color": "data(color)",
            width: "data(size)",
            height: "data(size)",
            label: "data(label)",
            color: foreground,
            "font-size": 11,
            "text-valign": "bottom",
            "text-margin-y": 4,
            "text-outline-color": background,
            "text-outline-width": 2,
            "min-zoomed-font-size": 7,
          },
        },
        {
          selector: "edge",
          style: {
            width: "data(width)",
            "line-color": muted,
            "line-opacity": 0.45,
            "curve-style": "bezier",
            "target-arrow-shape": "triangle",
            "target-arrow-color": muted,
            "arrow-scale": 0.8,
            label: "data(label)",
            "font-size": 9,
            color: muted,
            "text-rotation": "autorotate",
            "text-background-color": background,
            "text-background-opacity": 0.85,
            "text-background-padding": "1px",
            "min-zoomed-font-size": 9,
          },
        },
        { selector: "edge.agree", style: { "line-color": "#2fa37a", "target-arrow-color": "#2fa37a", "line-opacity": 0.8 } },
        { selector: "edge.contradict", style: { "line-color": "#d2475f", "target-arrow-color": "#d2475f", "line-style": "dashed", "line-opacity": 0.85 } },
        { selector: "edge.undirected", style: { "target-arrow-shape": "none" } },
        { selector: ".faded", style: { opacity: 0.12, "text-opacity": 0 } },
        { selector: "node.focus", style: { "border-width": 3, "border-color": foreground } },
      ],
      layout: {
        name: "fcose",
        animate: false,
        quality: nodes.length > 400 ? "draft" : "default",
        nodeSeparation: 90,
        idealEdgeLength: 110,
        nodeRepulsion: 9000,
        randomize: true,
      } as cytoscape.LayoutOptions,
    });

    cy.on("tap", "node", (event) => handlers.current.onSelectNode(event.target.id()));
    cy.on("tap", "edge", (event) => handlers.current.onSelectEdge?.(event.target.id()));
    cy.on("tap", (event) => { if (event.target === cy) handlers.current.onSelectNode(null); });

    cyRef.current = cy;
    return () => { cy.destroy(); cyRef.current = null; };
  }, [nodes, edges]);

  // Selecting a node dims everything outside its neighbourhood.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().removeClass("faded focus");
    const node = selectedId ? cy.getElementById(selectedId) : null;
    if (!node || node.empty()) return;
    const neighbourhood = node.closedNeighborhood();
    cy.elements().difference(neighbourhood).addClass("faded");
    node.addClass("focus");
    cy.animate({ center: { eles: node }, duration: 250 });
  }, [selectedId, nodes, edges]);

  return <div ref={containerRef} className="h-full w-full touch-none" role="application" aria-label="知识图谱" />;
}
