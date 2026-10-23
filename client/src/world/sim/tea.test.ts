// Iced tea stall: opening hours, stool reservations, the way out and back, and what shows on the sidewalk.
import { describe, expect, it } from 'vitest';
import { FOOT_DX, FOOT_DY, TILE } from '../constants';
import { TEA_DOOR, TEA_SEATS, TeaStall, routeToSeat, teaOpen, teaStallProps, wayBack } from './tea';

describe('tea stall', () => {
  it('opens in the morning and packs up at night', () => {
    expect(teaOpen(6)).toBe(false);
    expect(teaOpen(7)).toBe(true);
    expect(teaOpen(18)).toBe(true);
    // in front of an office: packs up once the office crowd has gone home
    expect(teaOpen(18.5)).toBe(false);
    expect(teaOpen(21)).toBe(false);
  });

  it('reserves each stool once, one per person, and frees them on release', () => {
    const t = new TeaStall();
    const rng = () => 0;
    const got = TEA_SEATS.map((_, i) => t.reserve(`a${i}`, rng));
    expect(new Set(got).size).toBe(TEA_SEATS.length);
    expect(t.hasFree()).toBe(false);
    expect(t.reserve('extra', rng)).toBe(-1);
    t.release('a0');
    expect(t.hasFree()).toBe(true);
    expect(t.reserve('a1', rng)).toBe(-1);
  });

  it('counts as sitting only after arriving', () => {
    const t = new TeaStall();
    const i = t.reserve('x', () => 0.5);
    expect(t.sitting()).toEqual([]);
    t.sit(i, 'x');
    expect(t.sitting()).toEqual(['x']);
    t.release('x');
    expect(t.sitting()).toEqual([]);
  });

  it('goes out through the west gap and comes back the same way, ending at the corridor door', () => {
    const seat = TEA_SEATS[0];
    const out = routeToSeat(seat);
    expect(out.slice(-2)).toEqual([seat.x, seat.y]);
    // the first point is already outside the glass (x < 1 tile)
    expect(out[0]).toBeLessThan(TILE);
    const back = wayBack(out);
    expect(back.slice(-2)).toEqual([TEA_DOOR.tx * TILE + FOOT_DX, TEA_DOOR.ty * TILE + FOOT_DY]);
    expect(back.slice(0, 2)).toEqual([seat.x, seat.y]);
    // called back halfway: retraces only what was walked
    expect(wayBack(out.slice(0, 4))).toEqual([out[2], out[3], out[0], out[1], TEA_DOOR.tx * TILE + FOOT_DX, TEA_DOOR.ty * TILE + FOOT_DY]);
  });

  it('shows the table and stools when set up, a stack when packed', () => {
    const up = teaStallProps(true).map((p) => p.kind);
    expect(up).toContain('tea_table');
    expect(up.filter((k) => k === 'tea_stool')).toHaveLength(TEA_SEATS.length + 1);
    expect(teaStallProps(false).map((p) => p.kind)).toEqual(['tea_stack']);
  });
});
