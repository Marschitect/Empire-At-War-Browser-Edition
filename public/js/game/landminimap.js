// Land radar <-> world mapping: the radar shows the playable rectangle with +y up, exactly as LandUI.drawRadar paints it.
const INSET = 1;

// Armed cursors the right button issues as an order.
export const ARMED_ORDERS = new Set(['guard', 'attack', 'move', 'attackmove']);

export function radarToWorld(map, fx, fy) {
  const lo = map.playMin,
    hi = map.playMax;
  return { x: lo[0] + fx * (hi[0] - lo[0]), y: lo[1] + (1 - fy) * (hi[1] - lo[1]) };
}

export function worldToRadar(map, x, y) {
  const lo = map.playMin,
    hi = map.playMax;
  return { fx: (x - lo[0]) / (hi[0] - lo[0]), fy: 1 - (y - lo[1]) / (hi[1] - lo[1]) };
}

// Order destinations stay strictly inside the play area, so a press on the radar's rim is still a valid move.
export function radarOrderPoint(map, fx, fy) {
  const lo = map.playMin,
    hi = map.playMax,
    p = radarToWorld(map, Math.min(1, Math.max(0, fx)), Math.min(1, Math.max(0, fy)));
  p.x = Math.min(hi[0] - INSET, Math.max(lo[0] + INSET, p.x));
  p.y = Math.min(hi[1] - INSET, Math.max(lo[1] + INSET, p.y));
  return p;
}

// What a radar press does, following the battlefield's own buttons: look, cancel the armed cursor, or order with a move mode.
export function radarPress(button, ui) {
  const busy = !!(ui.placing || ui.aiming);
  if (button === 2) {
    if (!busy && ARMED_ORDERS.has(ui.armed)) return { order: true, mode: ui.armed, disarm: ui.armed !== 'attackmove' };
    if (busy || ui.armed) return { cancel: true };
    return { order: true, mode: '', disarm: false };
  }
  if (button === 0 && !busy && ui.armed === 'waypoint') return { order: true, mode: 'waypoint', disarm: false };
  return button === 0 ? { look: true } : {};
}
