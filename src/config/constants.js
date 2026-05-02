// ── Network ───────────────────────────────────────────────────────────────────
export const NET_UPDATE_HZ   = 20;
export const NET_CONNECT_TTL = 4000;

// ── Player physics ────────────────────────────────────────────────────────────
export const THRUST         = 0.00042;
export const ROTATION_SPEED = 0.028;
export const MAX_CARGO      = 3;
export const MAX_FUEL       = 100;
export const FUEL_DRAIN     = 0.003;  // per ms → ~3/s → ~33 s full thrust before empty
export const FUEL_REGEN     = 0.0008; // per ms → ~0.8/s → ~125 s to refill from empty
export const COM_TORQUE_K   = 0.000018;

// ── Camera ────────────────────────────────────────────────────────────────────
export const ZOOM_MAX       = 1.32;
export const ZOOM_MIN       = 0.82;
export const ZOOM_LERP      = 0.025;
export const ZOOM_INITIAL   = 1.15;
export const SPEED_ZOOM_MAX = 0.09;

// ── Slingshot ─────────────────────────────────────────────────────────────────
export const SLINGSHOT_ZONE  = 0.45;
export const SLINGSHOT_MIN_V = 0.028;

// ── Delivery ──────────────────────────────────────────────────────────────────
export const PICKUP_RANGE   = 95;
export const DELIVERY_RANGE = 95;

// ── Scoring ───────────────────────────────────────────────────────────────────
export const BASE_POINTS        = 100;
export const TIME_BONUS_WINDOW  = 40000; // ms — full bonus window
export const TIME_BONUS_MULT    = 8;
export const STAR_THRESHOLD_5   = 90;
export const STAR_THRESHOLD_4   = 70;
export const STAR_THRESHOLD_3   = 50;
export const STAR_THRESHOLD_2   = 30;

// ── Explosion ─────────────────────────────────────────────────────────────────
export const BLAST_R         = 120;
export const BLAST_F         = 0.024;
export const BLAST_CARGO_DMG = 9;

// ── Remote players ────────────────────────────────────────────────────────────
export const LERP_POS = 0.22;
export const LERP_ROT = 0.18;

// ── Environment ───────────────────────────────────────────────────────────────
export const WORMHOLE_COOLDOWN = 2500; // ms
