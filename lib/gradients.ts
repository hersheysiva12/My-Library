export const gradientPalette = [
  // Deep crimson
  {
    coverGradient: "linear-gradient(160deg,#5c1a1a 0%,#3a0a0a 40%,#7a2020 100%)",
    glowColor: "rgba(180,40,40,0.65)",
    spineColor: "#5c1a1a",
    accentColor: "#f4a4a4",
  },
  // Forest green
  {
    coverGradient: "linear-gradient(160deg,#1a3d1a 0%,#0a200a 40%,#245c24 100%)",
    glowColor: "rgba(40,140,40,0.65)",
    spineColor: "#1a3d1a",
    accentColor: "#86efac",
  },
  // Aged gold
  {
    coverGradient: "linear-gradient(160deg,#4a3200 0%,#2e1e00 40%,#6a4800 100%)",
    glowColor: "rgba(190,130,10,0.65)",
    spineColor: "#4a3200",
    accentColor: "#fcd34d",
  },
  // Midnight sapphire
  {
    coverGradient: "linear-gradient(160deg,#0d1a4a 0%,#060e2e 40%,#1a2a6a 100%)",
    glowColor: "rgba(40,70,200,0.65)",
    spineColor: "#0d1a4a",
    accentColor: "#93c5fd",
  },
  // Oxblood
  {
    coverGradient: "linear-gradient(160deg,#4a0a1a 0%,#2e0610 40%,#6a1428 100%)",
    glowColor: "rgba(160,20,50,0.65)",
    spineColor: "#4a0a1a",
    accentColor: "#fda4af",
  },
  // Deep teal
  {
    coverGradient: "linear-gradient(160deg,#063a3a 0%,#022424 40%,#0a5252 100%)",
    glowColor: "rgba(20,140,140,0.65)",
    spineColor: "#063a3a",
    accentColor: "#5eead4",
  },
  // Burgundy
  {
    coverGradient: "linear-gradient(160deg,#3a0a2e 0%,#240618 40%,#54103e 100%)",
    glowColor: "rgba(140,20,100,0.65)",
    spineColor: "#3a0a2e",
    accentColor: "#f0abfc",
  },
  // Slate violet
  {
    coverGradient: "linear-gradient(160deg,#1e1040 0%,#100828 40%,#2e1a5c 100%)",
    glowColor: "rgba(80,50,200,0.65)",
    spineColor: "#1e1040",
    accentColor: "#c4b5fd",
  },
];

/** Returns a palette entry for a given index, cycling through the list. */
export function paletteForIndex(index: number) {
  return gradientPalette[index % gradientPalette.length];
}
