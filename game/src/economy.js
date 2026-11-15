// The buy economy: money earned each round, spent between rounds. A kill pays
// $300, a plant $300, a round win $3,250 and a round loss $1,900. The player
// starts with $800 and a free sidearm; primaries, grenades and plating are
// bought in the buy phase (B) and only then.
import { WEAPONS, GRENADE_PRICE, ARMOR_PRICE, ARMOR_VALUE } from './weapons.js';

export const START_MONEY = 800;
export const KILL_REWARD = 300;
export const PLANT_REWARD = 300;
export const WIN_REWARD = 3250;
export const LOSS_REWARD = 1900;
export const DEFUSE_REWARD = 300;
export const MAX_GRENADES = 2;

export const SHOP = [
  { id: 'smg', kind: 'primary', name: WEAPONS.smg.name, price: WEAPONS.smg.price, desc: 'Fast close-range spray, 28 rounds' },
  { id: 'shotgun', kind: 'primary', name: WEAPONS.shotgun.name, price: WEAPONS.shotgun.price, desc: 'Devastating up close, 8 pellets' },
  { id: 'rifle', kind: 'primary', name: WEAPONS.rifle.name, price: WEAPONS.rifle.price, desc: 'Precise and hard-hitting, 25 rounds' },
  { id: 'grenade', kind: 'grenade', name: 'Frag Grenade', price: GRENADE_PRICE, desc: 'Bounces, then blasts a 7 m radius' },
  { id: 'armor', kind: 'armor', name: 'Plating', price: ARMOR_PRICE, desc: 'Absorbs half of each hit, 50 points' },
];

export function createEconomy() {
  const state = {
    money: START_MONEY,
    primary: null, // weapon id or null
    grenades: 0,
    armor: 0,
  };

  return {
    state,
    reset() {
      state.money = START_MONEY;
      state.primary = null;
      state.grenades = 0;
      state.armor = 0;
    },
    earn(amount) {
      state.money += amount;
    },
    // Returns a message for the buy feed, or null when the purchase fails.
    buy(itemId) {
      const item = SHOP.find((entry) => entry.id === itemId);
      if (!item) return null;
      if (item.kind === 'primary' && state.primary === item.id) return null;
      if (item.kind === 'grenade' && state.grenades >= MAX_GRENADES) return null;
      if (item.kind === 'armor' && state.armor >= ARMOR_VALUE) return null;
      if (state.money < item.price) return null;
      state.money -= item.price;
      if (item.kind === 'primary') state.primary = item.id;
      if (item.kind === 'grenade') state.grenades += 1;
      if (item.kind === 'armor') state.armor = ARMOR_VALUE;
      return `Bought ${item.name} — $${item.price}`;
    },
    // A new round keeps the primary and refills its ammo; grenades and plating
    // stay as bought. The sidearm always returns with a full magazine.
    primaryDef() {
      return state.primary ? WEAPONS[state.primary] : null;
    },
  };
}
