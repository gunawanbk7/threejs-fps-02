// The look plan for EMBERLINE, in one place. A dusk freight yard: cold blue-grey
// steel and concrete, warm sodium lamps, rust-orange Sentinel accents and teal
// Vanguard accents. Every colour in the game and the page comes from these names.
export const PALETTE = {
  dusk: '#1a2027', // sky / canvas behind the yard
  concrete: '#3a4148', // ground slabs and warehouse walls
  asphalt: '#2b3138', // yard floor
  steel: '#4d565e', // containers and gantries, mid tone
  steelDark: '#333a41', // container ribs and crates
  rust: '#c96a2e', // Sentinel team, hazard paint, site A
  teal: '#2fa8a0', // Vanguard team, site B markers
  lamp: '#ffb347', // sodium light, muzzle flash, tracer warm end
  ink: '#e8e4d8', // HUD text, pale surfaces
  muted: '#8b959e', // secondary text, distant steel
  hazard: '#e8c33a', // hazard stripes and the charge
};

export const TEAM = {
  vanguard: { name: 'Vanguard', color: PALETTE.teal, dark: '#1d6f6a' },
  sentinel: { name: 'Sentinel', color: PALETTE.rust, dark: '#7e3f16' },
};
