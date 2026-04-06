import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Elio German",
    short_name: "Elio DE",
    description: "PrankMaster German homework quest",
    start_url: "/app",
    display: "standalone",
    background_color: "#1a472a",
    theme_color: "#3d8c40",
    lang: "en",
  };
}
