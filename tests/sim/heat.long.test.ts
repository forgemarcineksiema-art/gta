/**
 * M5.5 slice 0 (docs/M5.5_PLAN.md 0.5): the novice bot from heat 0 with the
 * traffic and the beat on reaches level 2 inside five minutes and level 3
 * inside nine at two seeds of three: the ratchet moves for a player who only
 * drives. Long: minutes of sim per seed.
 */
import { describe, expect, it } from 'vitest';
import { BotPolicy } from '../../src/app/botPolicy';
import { CITY_BOT_TUNING, TrackBot } from '../../src/app/trackBot';
import { createWorld, runUntil } from './helpers';

const SEEDS = [42, 7, 123];
const LEVEL2_BY = 300;
const LEVEL3_BY = 540;
/** A runaway is a bug too: the bot speeds past every patrol and rams, and even so level 3 must not come inside a minute. */
const LEVEL3_NOT_BEFORE = 60;

describe('heat that moves (long)', () => {
  it('0.5 the novice bot from heat 0 reaches level 2 inside 300 s and level 3 inside 540 s at two seeds of three, and never level 3 inside a minute', async () => {
    const rows: string[] = [];
    let ok2 = 0, ok3 = 0;
    for (const seed of SEEDS) {
      const sim = await createWorld({ map: 'city', seed, traffic: 1, peds: 0, record: false });
      try {
        const bot = new BotPolicy('novice', new TrackBot(sim.carId, CITY_BOT_TUNING));
        let t2 = -1;
        const t3 = runUntil(sim, LEVEL3_BY, (s) => {
          if (t2 < 0 && s.heat.level >= 2) t2 = s.time;
          if (s.run.state === 'busted') s.run.closeCard();
          else if (s.run.state === 'door') s.run.openDoor();
          return s.heat.level >= 3;
        }, (_t, c, s) => bot.drive(s, c, 1 / 60));
        rows.push(`seed ${seed}: level 2 at ${t2 < 0 ? 'never' : `${t2.toFixed(0)} s`}, level 3 at ${t3 < 0 ? `not by ${LEVEL3_BY} s` : `${t3.toFixed(0)} s`}, speedings ${sim.police!.speedings}, points ${sim.heat.points.toFixed(0)}`);
        if (t2 >= 0 && t2 <= LEVEL2_BY) ok2++;
        if (t3 >= 0 && t3 <= LEVEL3_BY) ok3++;
        if (t3 >= 0) expect(t3).toBeGreaterThanOrEqual(LEVEL3_NOT_BEFORE);
      } finally { sim.dispose(); }
    }
    console.info(`time to level (novice bot, traffic on):\n  ${rows.join('\n  ')}`);
    expect(ok2).toBeGreaterThanOrEqual(2);
    expect(ok3).toBeGreaterThanOrEqual(2);
  }, 900_000);
});
