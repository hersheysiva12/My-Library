export const gradientPalette = [
  // Deep crimson
  {
    coverGradient: "linear-gradient(160deg,#7a3838 0%,#442828 40%,#983e3e 100%)",
    glowColor: "rgba(180,40,40,0.65)",
    spineColor: "#7a3838",
    accentColor: "#f4a4a4",
  },
  // Forest green
  {
    coverGradient: "linear-gradient(160deg,#385b38 0%,#283e28 40%,#427a42 100%)",
    glowColor: "rgba(40,140,40,0.65)",
    spineColor: "#385b38",
    accentColor: "#86efac",
  },
  // Aged gold
  {
    coverGradient: "linear-gradient(160deg,#68501e 0%,#4c3c1e 40%,#88661e 100%)",
    glowColor: "rgba(190,130,10,0.65)",
    spineColor: "#68501e",
    accentColor: "#fcd34d",
  },
  // Midnight sapphire
  {
    coverGradient: "linear-gradient(160deg,#2b3868 0%,#242c4c 40%,#384888 100%)",
    glowColor: "rgba(40,70,200,0.65)",
    spineColor: "#2b3868",
    accentColor: "#93c5fd",
  },
  // Oxblood
  {
    coverGradient: "linear-gradient(160deg,#682838 0%,#4c242e 40%,#883246 100%)",
    glowColor: "rgba(160,20,50,0.65)",
    spineColor: "#682838",
    accentColor: "#fda4af",
  },
  // Deep teal
  {
    coverGradient: "linear-gradient(160deg,#245858 0%,#204242 40%,#287070 100%)",
    glowColor: "rgba(20,140,140,0.65)",
    spineColor: "#245858",
    accentColor: "#5eead4",
  },
  // Burgundy
  {
    coverGradient: "linear-gradient(160deg,#58284c 0%,#422436 40%,#722e5e 100%)",
    glowColor: "rgba(140,20,100,0.65)",
    spineColor: "#58284c",
    accentColor: "#f0abfc",
  },
  // Slate violet
  {
    coverGradient: "linear-gradient(160deg,#3c2e5e 0%,#2e2646 40%,#4c387a 100%)",
    glowColor: "rgba(80,50,200,0.65)",
    spineColor: "#3c2e5e",
    accentColor: "#c4b5fd",
  },
];

/** Returns a palette entry for a given index, cycling through the list. */
export function paletteForIndex(index: number) {
  return gradientPalette[index % gradientPalette.length];
}
