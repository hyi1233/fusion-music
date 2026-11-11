import { rememberBounded } from './textMeasureCache';

// src/components/visualizer/colorMix.ts
// Shared color helpers for visualizer renderers.
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const mix = (from: number, to: number, amount: number) => from + (to - from) * amount;
const FALLBACK_RGB = { r: 255, g: 255, b: 255 };

const isFiniteChannel = (value: number) => Number.isFinite(value);

const formatRgba = (channels: { r: number; g: number; b: number }, alpha: number) => (
    `rgba(${Math.round(clamp(channels.r, 0, 255))}, ${Math.round(clamp(channels.g, 0, 255))}, ${Math.round(clamp(channels.b, 0, 255))}, ${alpha})`
);

/**
 * The canonical "no background" colour. `transparent` is a CSS keyword, not a hex/rgb() colour:
 * @paper-design/shaders logs `Unsupported color format transparent` for it, THREE.Color logs
 * `Unknown color transparent` and keeps white, and our own hex parser returns a fallback. This
 * rgba() form is understood by CSS, Pixi Color, THREE.Color, paper shaders and Canvas alike.
 */
export const TRANSPARENT_COLOR = 'rgba(0, 0, 0, 0)';

type Channels = { r: number; g: number; b: number; a?: number };
/**
 * A colour string read once: its channels (plus its alpha when the source carries one), `fallback`
 * for input that is meant to be a colour but does not parse (empty, a broken hex or rgb()), or
 * `passthrough` for anything else (named colours, hsl(), ...) that colorWithAlpha hands back
 * untouched.
 */
type ParsedColor = Channels | 'fallback' | 'passthrough';

const alphaOf = (parsed: Channels) => clamp(parsed.a ?? 1, 0, 1);

const readColor = (normalizedColor: string): ParsedColor => {
    if (!normalizedColor) return 'fallback';

    // The CSS keyword never reaches a strict WebGL/Pixi/Three colour parser: it is transparent
    // black, so give every downstream renderer the parseable equivalent.
    if (normalizedColor.toLowerCase() === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };

    if (normalizedColor.startsWith('#')) {
        const hex = normalizedColor.slice(1);
        const parse = (value: string) => Number.parseInt(value, 16);
        const hexAlpha = (digits: string, max: number) => clamp(parse(digits) / max, 0, 1);

        if (/^[0-9a-fA-F]{3}$/.test(hex)) {
            return {
                r: parse(hex[0] + hex[0]),
                g: parse(hex[1] + hex[1]),
                b: parse(hex[2] + hex[2]),
                a: 1,
            };
        }

        // #RGBA (CSS Color 4). Alpha is kept so a transparent theme stays transparent.
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
            return {
                r: parse(hex[0] + hex[0]),
                g: parse(hex[1] + hex[1]),
                b: parse(hex[2] + hex[2]),
                a: hexAlpha(hex[3], 15),
            };
        }

        if (/^[0-9a-fA-F]{6}$/.test(hex)) {
            return {
                r: parse(hex.slice(0, 2)),
                g: parse(hex.slice(2, 4)),
                b: parse(hex.slice(4, 6)),
                a: 1,
            };
        }

        // #RRGGBBAA (CSS Color 4). This is what a theme generator writes when it needs a
        // transparent background; ignore the alpha for RGB but remember it for alpha blending.
        if (/^[0-9a-fA-F]{8}$/.test(hex)) {
            return {
                r: parse(hex.slice(0, 2)),
                g: parse(hex.slice(2, 4)),
                b: parse(hex.slice(4, 6)),
                a: hexAlpha(hex.slice(6, 8), 255),
            };
        }

        return 'fallback';
    }

    const rgbMatch = normalizedColor.match(/^rgba?\(([^)]+)\)$/i);
    if (rgbMatch) {
        // Both the legacy `r, g, b[, a]` and the CSS Color 4 `r g b [/ a]` forms.
        const parts = rgbMatch[1]
            .replace(/\s*\/\s*/g, ' ')
            .replace(/,/g, ' ')
            .trim()
            .split(/\s+/)
            .filter(Boolean);
        const [r, g, b] = parts.slice(0, 3).map(part => Number.parseFloat(part));
        if (![r, g, b].every(isFiniteChannel)) return 'fallback';
        const parsedAlpha = parts.length > 3 ? Number.parseFloat(parts[3]) : 1;
        return { r, g, b, a: isFiniteChannel(parsedAlpha) ? clamp(parsedAlpha, 0, 1) : 1 };
    }

    return 'passthrough';
};

// Renderers ask for the same few theme colours every frame, often once per glyph; the regexes
// and parseInt calls above are the expensive part, so each distinct string is read once.
const parsedColors = new Map<string, ParsedColor>();
const PARSED_COLOR_LIMIT = 512;

const parseColor = (color: string): { normalized: string; parsed: ParsedColor } => {
    const normalized = typeof color === 'string' ? color.trim() : '';
    let parsed = parsedColors.get(normalized);
    if (parsed === undefined) {
        parsed = rememberBounded(parsedColors, normalized, readColor(normalized), PARSED_COLOR_LIMIT);
    }
    return { normalized, parsed };
};

export const colorWithAlpha = (color: string, alpha: number) => {
    const normalizedAlpha = clamp(alpha, 0, 1);
    const { normalized, parsed } = parseColor(color);
    if (parsed === 'passthrough') return normalized;
    if (parsed === 'fallback') return formatRgba(FALLBACK_RGB, normalizedAlpha);
    // Keep a fully transparent theme transparent: a cover backdrop must not be covered by an
    // opaque dark shield derived from its background colour. Opaque sources keep the old result.
    return formatRgba(parsed, normalizedAlpha * alphaOf(parsed));
};

/** The colour's channels, or null when it is not a hex or rgb() colour. Returns a fresh object. */
export const parseColorChannels = (color: string): Channels | null => {
    const { parsed } = parseColor(color);
    return typeof parsed === 'string' ? null : { r: parsed.r, g: parsed.g, b: parsed.b };
};

/** The colour's alpha in 0..1, or null when the colour is not a hex or rgb() colour. */
export const parseColorAlpha = (color: string): number | null => {
    const { parsed } = parseColor(color);
    return typeof parsed === 'string' ? null : alphaOf(parsed);
};

/**
 * Suppress dark, muddy halos; fade in over midtones so animated RGB (0–255) does not pop.
 * Gated on HSV value (the brightest channel), not luma: saturated keyword colours such as red
 * #ef4444 or blue #2563eb have low luma but still glow cleanly, while near-black navy stays dark.
 */
export const resolveGlowColorStrength = (r: number, g: number, b: number): number => {
    const value = Math.max(r, g, b);
    const progress = clamp((value - 110) / 50, 0, 1);
    return progress * progress * (3 - 2 * progress);
};

export const mixColors = (from: string, to: string, amount: number, alpha = 1) => {
    const normalizedAmount = clamp(amount, 0, 1);
    const fromParsed = parseColor(from).parsed;
    const toParsed = parseColor(to).parsed;

    if (typeof fromParsed === 'string' || typeof toParsed === 'string') {
        return colorWithAlpha(normalizedAmount >= 0.5 ? to : from, alpha);
    }

    // Blend the endpoints' alpha too, so a palette fade into a transparent background does not
    // flash an opaque colour on the way. Both endpoints opaque leaves `alpha` untouched.
    const mixedAlpha = clamp(alpha, 0, 1) * mix(alphaOf(fromParsed), alphaOf(toParsed), normalizedAmount);
    return `rgba(${Math.round(mix(fromParsed.r, toParsed.r, normalizedAmount))}, ${Math.round(mix(fromParsed.g, toParsed.g, normalizedAmount))}, ${Math.round(mix(fromParsed.b, toParsed.b, normalizedAmount))}, ${mixedAlpha})`;
};
