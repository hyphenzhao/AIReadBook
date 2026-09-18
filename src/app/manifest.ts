import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AIReadBook - AI 深度阅读助手",
    short_name: "AIReadBook",
    description: "AI 驱动的深度阅读助手，聚焦理解和吸收",
    start_url: "/library",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#6366f1",
    icons: [
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
