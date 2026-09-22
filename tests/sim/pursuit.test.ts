import { describe, expect, it } from 'vitest';
import { EventLog } from '../../src/sim/events';
import { Pursuit } from '../../src/sim/police/Pursuit';

const DT = 1 / 60;

describe('pursuit', () => {
  it.each([1, 2, 3, 4, 5])('escapes level %i on exactly its unseen cooldown step', (level) => {
    const events = new EventLog();
    const pursuit = new Pursuit(events);
    pursuit.step(DT, level, true, 10, 20);
    expect(pursuit.state).toBe('detected');
    pursuit.step(DT, level, true, 20, 30);
    expect(pursuit.state).toBe('active');
    const seconds = [0, 6, 8, 10, 12, 15][level]!;
    for (let tick = 0; tick < seconds * 60 - 1; tick++) pursuit.step(DT, level, false, 100, 100);
    expect(pursuit.state).toBe('lost');
    expect(pursuit.lastX).toBe(20);
    expect(pursuit.lastZ).toBe(30);
    expect(pursuit.escapes).toBe(0);
    pursuit.step(DT, level, false, 100, 100);
    expect(pursuit.state).toBe('idle');
    expect(pursuit.escapes).toBe(1);
    const escapes: number[] = [];
    events.readFrom(0, (e) => { if (e.kind === 'escape') escapes.push(e.value); });
    expect(escapes).toEqual([level]);
    for (let tick = 0; tick < 600; tick++) pursuit.step(DT, level, false, 100, 100);
    expect(pursuit.escapes).toBe(1);
  });

  it('reacquisition restarts the entire escape window; heat zero never detects', () => {
    const pursuit = new Pursuit(new EventLog());
    pursuit.step(DT, 0, true, 0, 0);
    expect(pursuit.state).toBe('idle');
    pursuit.step(DT, 1, true, 0, 0);
    for (let tick = 0; tick < 359; tick++) pursuit.step(DT, 1, false, 0, 0);
    pursuit.step(DT, 1, true, 50, 60);
    expect(pursuit.state).toBe('active');
    for (let tick = 0; tick < 359; tick++) pursuit.step(DT, 1, false, 0, 0);
    expect(pursuit.state).toBe('lost');
    pursuit.step(DT, 1, false, 0, 0);
    expect(pursuit.state).toBe('idle');
    expect(pursuit.escapes).toBe(1);
  });
});
