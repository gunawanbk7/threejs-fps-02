// The match: rounds, buy phases and win conditions, all in one place. A match
// is first to 5 rounds (at most 9). A round is won by eliminating the other
// team, by the charge detonating, by defusing it, or — with no plant — by the
// clock running out. Money is earned per kill, plant and round result.
import * as THREE from 'three';
import { PLANT_REWARD, KILL_REWARD, WIN_REWARD, LOSS_REWARD, DEFUSE_REWARD } from './economy.js';
import { WEAPONS } from './weapons.js';

export const BUY_TIME = 15;
export const ROUND_TIME = 100;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;

export function createGame(ctx) {
  const { map, player, bots, charge, projectiles, effects, audio, hud, economy, input } = ctx;
  const state = {
    phase: 'menu', // menu | buy | live | roundEnd | matchEnd
    round: 0,
    score: { vanguard: 0, sentinel: 0 },
    timer: 0,
    phaseTimer: 0,
    kills: 0,
    deaths: 0,
    plants: 0,
    playerSite: 'A',
    lastTickSecond: -1,
  };

  function aliveCount(team) {
    let count = 0;
    for (const bot of bots.list) if (bot.team === team && bot.alive) count += 1;
    if (team === 'vanguard' && player.state.alive) count += 1;
    return count;
  }

  function nearestSite(position) {
    const dA = position.distanceTo(map.sites.A.center);
    const dB = position.distanceTo(map.sites.B.center);
    return dA <= dB ? 'A' : 'B';
  }

  function inSite(position) {
    if (map.sites.A.box.containsPoint(position)) return 'A';
    if (map.sites.B.box.containsPoint(position)) return 'B';
    return null;
  }

  function startBuyPhase() {
    state.phase = 'buy';
    state.phaseTimer = BUY_TIME;
    state.round += 1;
    charge.reset();
    projectiles.reset();
    // Fresh bodies, kept loadout: the primary stays bought, the sidearm refills.
    player.reset(map.spawns.vanguard[0]);
    ctx.weapon.show();
    const primary = economy.primaryDef();
    ctx.weapon.equip(primary ?? WEAPONS.pistol);
    player.state.armor = economy.state.armor;
    bots.spawnRound();
    hud.setScore(state.score.vanguard, state.score.sentinel, state.round);
    hud.setMoney(economy.state.money);
    hud.setHealth(100);
    hud.setArmor(player.state.armor);
    hud.setAmmo(ctx.weapon.state.mag, ctx.weapon.state.reserve);
    hud.setWeapon(ctx.weapon.state.def.name, economy.state.grenades);
    hud.setTimer(BUY_TIME);
    hud.showBuy(true);
    hud.banner(`ROUND ${state.round}`, 'Buy phase — B to shop, Deploy when ready');
    input.releaseLock();
  }

  function startRound() {
    state.phase = 'live';
    state.timer = ROUND_TIME;
    state.lastTickSecond = -1;
    hud.showBuy(false);
    hud.banner(`ROUND ${state.round}`, 'Plant the charge at Site A or Site B');
    hud.setTimer(ROUND_TIME);
    audio.roundStart();
    if (!ctx.shotMode) input.requestLock();
  }

  function endRound(winner, reason) {
    if (state.phase !== 'live') return;
    state.phase = 'roundEnd';
    state.phaseTimer = 3.5;
    state.score[winner] += 1;
    const won = winner === 'vanguard';
    economy.earn(won ? WIN_REWARD : LOSS_REWARD);
    hud.setScore(state.score.vanguard, state.score.sentinel, state.round);
    hud.setMoney(economy.state.money);
    hud.banner(won ? 'ROUND WON' : 'ROUND LOST', reason);
    hud.killfeed(`${won ? 'Vanguard' : 'Sentinel'} takes round ${state.round} — ${reason}`, won);
    audio.roundEnd(won);
    hud.setDefuseWarning(false);
    input.releaseLock();
  }

  function endMatch() {
    state.phase = 'matchEnd';
    const won = state.score.vanguard > state.score.sentinel;
    hud.showOverlay('match', {
      title: won ? 'VANGUARD WINS THE MATCH' : 'SENTINEL WINS THE MATCH',
      copy: `Final score ${state.score.vanguard}–${state.score.sentinel} · ${state.kills} eliminations, ${state.deaths} deaths, ${state.plants} plants. Click to play again.`,
    });
    input.releaseLock();
  }

  function startMatch() {
    state.score = { vanguard: 0, sentinel: 0 };
    state.round = 0;
    state.kills = 0;
    state.deaths = 0;
    state.plants = 0;
    economy.reset();
    hud.hideOverlay();
    startBuyPhase();
  }

  // A bot's shot landed on its target. The game applies the damage and the
  // feedback: the player's screen flashes, a bot's health bar drops.
  function onBotShot(bot, target, amount, head, muzzle, end) {
    effects.tracer(muzzle, end);
    audio.shot(bot.position.distanceTo(ctx.camera.position));
    if (target.kind === 'player') {
      const dealt = player.damage(amount);
      hud.setHealth(player.state.health);
      hud.setArmor(player.state.armor);
      hud.damageFlash();
      audio.hurt();
      if (!player.state.alive) {
        state.deaths += 1;
        ctx.weapon.hide();
        hud.killfeed(`${bot.name} eliminated you`, false);
        hud.banner('YOU ARE DOWN', 'Your squad fights on — next round you deploy again');
      }
    } else {
      const killed = bots.damage(target.ref, amount, head ? 'head' : 'body', bot.position);
      if (killed) {
        hud.killfeed(`${bot.name} eliminated ${target.ref.name}`, target.ref.team === 'sentinel');
      }
    }
  }

  // A grenade or the charge went off: damage falls off with distance and a wall
  // between the blast and a body blocks it entirely.
  function onBlast(position, radius, damage) {
    const raycaster = ctx.raycaster;
    function blastAt(bodyPos, apply) {
      const distance = bodyPos.distanceTo(position);
      if (distance > radius) return;
      const direction = bodyPos.clone().sub(position).normalize();
      raycaster.set(position, direction);
      raycaster.far = distance;
      if (raycaster.intersectObjects(map.shootables, false)[0]) return;
      const amount = damage * (1 - (distance / radius) * 0.6);
      apply(amount);
    }
    if (player.state.alive) {
      blastAt(new THREE.Vector3(player.state.position.x, player.state.position.y + 1.2, player.state.position.z), (amount) => {
        player.damage(amount);
        hud.setHealth(player.state.health);
        hud.setArmor(player.state.armor);
        hud.damageFlash();
        audio.hurt();
        if (!player.state.alive) {
          state.deaths += 1;
          ctx.weapon.hide();
          hud.killfeed('The blast took you down', false);
        }
      });
    }
    for (const bot of bots.list) {
      if (!bot.alive) continue;
      blastAt(new THREE.Vector3(bot.position.x, bot.position.y + 1.2, bot.position.z), (amount) => {
        const killed = bots.damage(bot, amount, 'body', position);
        if (killed) hud.killfeed(`The blast eliminated ${bot.name}`, bot.team === 'sentinel');
      });
    }
  }

  function onDefused(bot) {
    if (state.phase !== 'live' || !charge.state.planted) return;
    economy.earn(DEFUSE_REWARD);
    charge.reset();
    endRound('sentinel', `${bot.name} defused the charge`);
  }

  function step(dt) {
    if (state.phase === 'buy') {
      state.phaseTimer -= dt;
      hud.setTimer(state.phaseTimer);
      if (state.phaseTimer <= 0) startRound();
      return;
    }
    if (state.phase === 'roundEnd') {
      state.phaseTimer -= dt;
      if (state.phaseTimer <= 0) {
        if (state.score.vanguard >= WIN_ROUNDS || state.score.sentinel >= WIN_ROUNDS || state.round >= MAX_ROUNDS) endMatch();
        else startBuyPhase();
      }
      return;
    }
    if (state.phase !== 'live') return;

    // The clock.
    state.timer -= dt;
    hud.setTimer(state.timer);
    const second = Math.ceil(state.timer);
    if (second !== state.lastTickSecond) {
      state.lastTickSecond = second;
      if (second <= 10 && second > 0) audio.tick();
    }

    // Planting: hold E inside a site while alive.
    const site = player.state.alive ? inSite(player.state.position) : null;
    state.playerSite = nearestSite(player.state.position);
    if (!charge.state.planted) {
      const holding = input.state.keys.has('KeyE');
      charge.plantStep(dt, site !== null, holding);
      if (charge.state.planting >= 1) {
        charge.plantAt(player.state.position, site);
        state.plants += 1;
        economy.earn(PLANT_REWARD);
        hud.setMoney(economy.state.money);
        hud.banner('CHARGE PLANTED', `at Site ${site} — defend it for ${charge.state.fuse | 0} seconds`);
        hud.killfeed(`You planted the charge at Site ${site} (+$${PLANT_REWARD})`, true);
        audio.plantDone();
        for (const bot of bots.list) bots.hearShot(bot, player.state.position, 'vanguard');
      }
      hud.setPlant(
        charge.state.planting > 0 || (site && holding) ? charge.state.planting : null,
        site ? `Planting the charge — Site ${site}` : 'Planting…',
      );
    } else {
      hud.setPlant(null);
      charge.step(dt, () => audio.beep(true));
      if (charge.state.fuse <= 0) {
        const pos = charge.state.position.clone();
        effects.explosion(pos);
        audio.explosion();
        charge.reset();
        onBlast(pos, 12, 200);
        endRound('vanguard', 'The charge detonated at the site');
        return;
      }
      const defusing = bots.list.some((b) => b.alive && b.team === 'sentinel' && b.state === 'DEFUSE' && b.defuseProgress > 0);
      hud.setDefuseWarning(defusing);
    }

    // Elimination wins.
    if (aliveCount('sentinel') === 0) {
      endRound('vanguard', 'All Sentinels eliminated');
      return;
    }
    if (aliveCount('vanguard') === 0) {
      endRound('sentinel', 'All Vanguard eliminated');
      return;
    }

    // Time out with no plant: the defenders hold.
    if (state.timer <= 0 && !charge.state.planted) {
      endRound('sentinel', 'Time expired — the charge was never planted');
    }
  }

  return {
    state,
    startMatch,
    startRound,
    startBuyPhase,
    endRound,
    endMatch,
    onBotShot,
    onBlast,
    onDefused,
    step,
    aliveCount,
    playerKilled(bot, head) {
      state.kills += 1;
      economy.earn(KILL_REWARD);
      hud.setMoney(economy.state.money);
      hud.killfeed(`You eliminated ${bot.name}${head ? ' — headshot' : ''} (+$${KILL_REWARD})`, true);
    },
  };
}
