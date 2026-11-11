import { parseColorAlpha, parseColorChannels, TRANSPARENT_COLOR } from '../components/visualizer/colorMix';

// src/utils/themeColorMath.ts
// Hex-space color math for theme generation: RGB/HSL conversion, WCAG luminance and contrast,
// plus a lightness solver that keeps a generated color's hue while forcing it past a contrast
// floor (instead of swapping in a hard-coded fallback color).
//
// It also owns the one colour string every renderer can parse. `Theme.backgroundColor` is read by
// CSS, Pixi Color, THREE.Color, Canvas and @paper-design/shaders; those parsers only accept
// hex / rgb() forms, so the CSS keyword `transparent` must never be handed to them.

export type Rgb = { r: number; g: number; b: number; };
export type Hsl = { h: number; s: number; l: number; };

const FALLBACK_THEME_COLOR = '#4f7cff';

export const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const clampChannel = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

export const normalizeHue = (hue: number) => ((hue % 360) + 360) % 360;

/**
 * The only "no background" colour a theme should carry. `transparent` is a CSS keyword that the
 * WebGL / Pixi / Three / shader colour parsers reject (`Unsupported color format transparent`,
 * or Three silently keeping white); this rgba() form parses everywhere and is fully transparent.
 */
export const TRANSPARENT_THEME_COLOR = TRANSPARENT_COLOR;

/** True for the `transparent` keyword and for any hex/rgb() colour whose alpha is zero. */
export const isTransparentColor = (value: unknown): boolean => {
    if (typeof value !== 'string') return false;
    if (value.trim().toLowerCase() === 'transparent') return true;
    const alpha = parseColorAlpha(value);
    return alpha !== null && alpha <= 0;
};

/**
 * Canonicalises a theme colour into a form every downstream parser accepts:
 *   * `transparent` (and any fully transparent rgba/#RRGGBB00) -> `rgba(0, 0, 0, 0)`
 *   * an opaque hex / rgb() colour -> a plain `#rrggbb`
 *   * a semi-transparent colour -> `rgba(r, g, b, a)`
 *   * a named colour / broken string -> `fallback` (they would make a shader log an error)
 *
 * Use this at the boundary where a theme enters the renderer (host bridge, WebView page, stage).
 */
export const normalizeThemeColor = (value: string | null | undefined, fallback = '#000000'): string => {
    if (typeof value !== 'string' || !value.trim()) return fallback;
    const trimmed = value.trim();
    if (trimmed.toLowerCase() === 'transparent') return TRANSPARENT_THEME_COLOR;
    const channels = parseColorChannels(trimmed);
    const alpha = parseColorAlpha(trimmed);
    if (!channels || alpha === null) return fallback;
    const rgb = { r: clampChannel(channels.r), g: clampChannel(channels.g), b: clampChannel(channels.b) };
    return alpha >= 1 ? rgbToHex(rgb) : `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clamp01(alpha)})`;
};

/**
 * THREE.Color cannot read rgba() with alpha or 8-digit hex (`Invalid hex color`, and it warns about
 * ignored alpha). Give strict colour constructors an opaque `#rrggbb` and let the WebGL renderer's
 * own `backgroundAlpha` handle transparency instead.
 */
export const toOpaqueHex = (value: string | null | undefined, fallback = '#000000'): string => {
    const channels = typeof value === 'string' ? parseColorChannels(value) : null;
    return channels
        ? rgbToHex({ r: clampChannel(channels.r), g: clampChannel(channels.g), b: clampChannel(channels.b) })
        : fallback;
};

/**
 * Parses a theme colour into RGB channels. `transparent` resolves to transparent black (0,0,0)
 * instead of `null`, so luminance / contrast / mix helpers degrade gracefully rather than
 * falling back to a blue or white swatch.
 */
export const parseThemeColor = (value: string): Rgb | null => {
    const channels = typeof value === 'string' ? parseColorChannels(value) : null;
    if (!channels) {
        return null;
    }

    return {
        r: clampChannel(channels.r),
        g: clampChannel(channels.g),
        b: clampChannel(channels.b),
    };
};

export const rgbToHex = ({ r, g, b }: Rgb) => (
    `#${[r, g, b].map(channel => clampChannel(channel).toString(16).padStart(2, '0')).join('')}`
);

export const rgbToHsl = ({ r, g, b }: Rgb): Hsl => {
    const red = clampChannel(r) / 255;
    const green = clampChannel(g) / 255;
    const blue = clampChannel(b) / 255;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const delta = max - min;
    const lightness = (max + min) / 2;

    if (delta === 0) {
        return { h: 0, s: 0, l: lightness };
    }

    const saturation = delta / (1 - Math.abs(2 * lightness - 1));

    let hue: number;
    if (max === red) {
        hue = ((green - blue) / delta) % 6;
    } else if (max === green) {
        hue = (blue - red) / delta + 2;
    } else {
        hue = (red - green) / delta + 4;
    }

    return { h: normalizeHue(hue * 60), s: clamp01(saturation), l: clamp01(lightness) };
};

export const hslToRgb = ({ h, s, l }: Hsl): Rgb => {
    const hue = normalizeHue(h);
    const saturation = clamp01(s);
    const lightness = clamp01(l);

    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const secondary = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
    const offset = lightness - chroma / 2;

    const sector = Math.floor(hue / 60) % 6;
    const [r, g, b] = sector === 0 ? [chroma, secondary, 0]
        : sector === 1 ? [secondary, chroma, 0]
            : sector === 2 ? [0, chroma, secondary]
                : sector === 3 ? [0, secondary, chroma]
                    : sector === 4 ? [secondary, 0, chroma]
                        : [chroma, 0, secondary];

    return {
        r: clampChannel((r + offset) * 255),
        g: clampChannel((g + offset) * 255),
        b: clampChannel((b + offset) * 255),
    };
};

export const hexToHsl = (color: string): Hsl | null => {
    const parsed = parseThemeColor(color);
    return parsed ? rgbToHsl(parsed) : null;
};

export const hslToHex = (hsl: Hsl) => rgbToHex(hslToRgb(hsl));

// Linear RGB blend that stays in hex space; Theme color fields only accept hex.
export const mixHexColors = (from: string, to: string, amount: number) => {
    const start = parseThemeColor(from);
    const end = parseThemeColor(to);

    if (!start || !end) {
        return rgbToHex(parseThemeColor(to) || parseThemeColor(from) || parseThemeColor(FALLBACK_THEME_COLOR)!);
    }

    const ratio = clamp01(amount);
    return rgbToHex({
        r: start.r + (end.r - start.r) * ratio,
        g: start.g + (end.g - start.g) * ratio,
        b: start.b + (end.b - start.b) * ratio,
    });
};

export const getRelativeLuminance = (color: string) => {
    const parsed = parseThemeColor(color);
    if (!parsed) return 0;

    const transform = (channel: number) => {
        const normalized = channel / 255;
        return normalized <= 0.03928
            ? normalized / 12.92
            : Math.pow((normalized + 0.055) / 1.055, 2.4);
    };

    return 0.2126 * transform(parsed.r) + 0.7152 * transform(parsed.g) + 0.0722 * transform(parsed.b);
};

export const getContrastRatio = (foreground: string, background: string) => {
    const luminanceA = getRelativeLuminance(foreground);
    const luminanceB = getRelativeLuminance(background);
    const [lighter, darker] = luminanceA > luminanceB
        ? [luminanceA, luminanceB]
        : [luminanceB, luminanceA];

    return (lighter + 0.05) / (darker + 0.05);
};

export const getHueDistance = (a: number, b: number) => {
    const distance = Math.abs(normalizeHue(a) - normalizeHue(b));
    return Math.min(distance, 360 - distance);
};

// Walks the color's lightness away from the background until the contrast floor is met, keeping
// hue and saturation intact. Returns the best-contrast candidate when the floor is unreachable.
export const adjustLightnessForContrast = (
    color: string,
    background: string,
    minRatio: number,
    step = 0.02,
    maxSteps = 50,
) => {
    const hsl = hexToHsl(color);
    if (!hsl) {
        return color;
    }

    const goDarker = getRelativeLuminance(background) > 0.35;
    const direction = goDarker ? -1 : 1;

    let bestColor = hslToHex(hsl);
    let bestRatio = getContrastRatio(bestColor, background);

    for (let index = 0; index <= maxSteps; index += 1) {
        const lightness = clamp01(hsl.l + direction * step * index);
        const candidate = hslToHex({ ...hsl, l: lightness });
        const ratio = getContrastRatio(candidate, background);

        if (ratio > bestRatio) {
            bestRatio = ratio;
            bestColor = candidate;
        }

        if (ratio >= minRatio) {
            return candidate;
        }

        // Already clamped at an end of the lightness axis: no further step can help.
        if (index > 0 && (lightness === 0 || lightness === 1)) {
            break;
        }
    }

    return bestColor;
};
