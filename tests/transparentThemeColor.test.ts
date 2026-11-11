import { describe, it, expect, vi, afterEach } from 'vitest';
import { Color as ThreeColor } from 'three';
import { getShaderColorFromString } from '@paper-design/shaders';
import {
    TRANSPARENT_COLOR,
    colorWithAlpha,
    mixColors,
    parseColorAlpha,
    parseColorChannels,
} from '../src/components/visualizer/colorMix';
import {
    TRANSPARENT_THEME_COLOR,
    getRelativeLuminance,
    isTransparentColor,
    mixHexColors,
    normalizeThemeColor,
    parseThemeColor,
    toOpaqueHex,
} from '../src/utils/themeColorMath';

// v3 封面透明背景回归测试：`transparent` 是 CSS 关键字，Pixi Color / THREE.Color /
// @paper-design/shaders 的取色器只认 hex 与 rgb()，直接喂关键字会报
// "Unsupported color format transparent"（shader）或把 THREE.Color 留在白色。

afterEach(() => vi.restoreAllMocks());

describe('colorMix: 透明颜色解析', () => {
    it('transparent 关键字解析成透明黑，并带 alpha 0', () => {
        expect(parseColorChannels('transparent')).toEqual({ r: 0, g: 0, b: 0 });
        expect(parseColorAlpha('transparent')).toBe(0);
        expect(parseColorChannels('  TRANSPARENT ')).toEqual({ r: 0, g: 0, b: 0 });
    });

    it('rgba(0,0,0,0) / #00000000 / #0000 都解析为 alpha 0', () => {
        expect(parseColorAlpha('rgba(0, 0, 0, 0)')).toBe(0);
        expect(parseColorAlpha('rgba(0,0,0,0)')).toBe(0);
        expect(parseColorAlpha('#00000000')).toBe(0);
        expect(parseColorAlpha('#0000')).toBe(0);
        expect(parseColorChannels('#00000000')).toEqual({ r: 0, g: 0, b: 0 });
    });

    it('8 位 / 4 位 hex 与 CSS Color 4 空格斜杠语法都能读出通道', () => {
        expect(parseColorChannels('#1a2b3c80')).toEqual({ r: 26, g: 43, b: 60 });
        expect(parseColorAlpha('#1a2b3c80')).toBeCloseTo(128 / 255, 3);
        expect(parseColorChannels('#abcd')).toEqual({ r: 170, g: 187, b: 204 });
        expect(parseColorChannels('rgb(10 20 30 / 0.5)')).toEqual({ r: 10, g: 20, b: 30 });
        expect(parseColorAlpha('rgb(10 20 30 / 0.5)')).toBe(0.5);
    });

    it('普通 hex 与不透明 rgb() 的旧行为完全不变', () => {
        expect(parseColorChannels('#05070d')).toEqual({ r: 5, g: 7, b: 13 });
        expect(parseColorAlpha('#05070d')).toBe(1);
        expect(colorWithAlpha('#05070d', 0.5)).toBe('rgba(5, 7, 13, 0.5)');
        expect(colorWithAlpha('#abc', 0.25)).toBe('rgba(170, 187, 204, 0.25)');
        expect(colorWithAlpha('rgba(5, 7, 13, 1)', 0.5)).toBe('rgba(5, 7, 13, 0.5)');
        expect(mixColors('#ff0000', '#0000ff', 0.5)).toBe('rgba(128, 0, 128, 1)');
    });

    it('透明主题色派生出来的填充必须继续透明，不能盖成不透明黑', () => {
        expect(colorWithAlpha('transparent', 0.96)).toBe(TRANSPARENT_COLOR);
        expect(colorWithAlpha('rgba(0, 0, 0, 0)', 0.28)).toBe('rgba(0, 0, 0, 0)');
        expect(colorWithAlpha('#00000000', 0.86)).toBe('rgba(0, 0, 0, 0)');
        // 调色板淡入透明背景时也不该闪出一块不透明色
        expect(mixColors('#05070d', 'transparent', 1)).toBe('rgba(0, 0, 0, 0)');
        expect(mixColors('transparent', '#05070d', 0)).toBe('rgba(0, 0, 0, 0)');
    });
});

describe('themeColorMath: 主题背景色归一化', () => {
    it('transparent / rgba(0,0,0,0) / #00000000 归一成同一个合法值', () => {
        expect(TRANSPARENT_THEME_COLOR).toBe('rgba(0, 0, 0, 0)');
        expect(normalizeThemeColor('transparent')).toBe(TRANSPARENT_THEME_COLOR);
        expect(normalizeThemeColor('rgba(0, 0, 0, 0)')).toBe(TRANSPARENT_THEME_COLOR);
        expect(normalizeThemeColor('#00000000')).toBe(TRANSPARENT_THEME_COLOR);
    });

    it('合法 hex 保持语义，非法/命名色走兜底（避免 shader 报错）', () => {
        expect(normalizeThemeColor('#05070d')).toBe('#05070d');
        expect(normalizeThemeColor('#ABC')).toBe('#aabbcc');
        expect(normalizeThemeColor('rgba(5, 7, 13, 0.5)')).toBe('rgba(5, 7, 13, 0.5)');
        expect(normalizeThemeColor('#000000ff')).toBe('#000000');
        expect(normalizeThemeColor('red')).toBe('#000000');
        expect(normalizeThemeColor('red', '#05070d')).toBe('#05070d');
        expect(normalizeThemeColor('')).toBe('#000000');
    });

    it('isTransparentColor / toOpaqueHex / parseThemeColor 都认 transparent', () => {
        expect(isTransparentColor('transparent')).toBe(true);
        expect(isTransparentColor(TRANSPARENT_THEME_COLOR)).toBe(true);
        expect(isTransparentColor('#00000000')).toBe(true);
        expect(isTransparentColor('#00000080')).toBe(false);
        expect(isTransparentColor('#05070d')).toBe(false);
        expect(isTransparentColor(undefined)).toBe(false);
        expect(toOpaqueHex('transparent')).toBe('#000000');
        expect(toOpaqueHex('rgba(0, 0, 0, 0)')).toBe('#000000');
        expect(toOpaqueHex('#05070d')).toBe('#05070d');
        expect(parseThemeColor('transparent')).toEqual({ r: 0, g: 0, b: 0 });
        expect(getRelativeLuminance('transparent')).toBe(0);
        expect(mixHexColors('#ffffff', 'transparent', 0.5)).toBe('#808080');
    });
});

describe('严格渲染器取色器：归一化后的颜色不报错', () => {
    it('@paper-design/shaders 接受归一化值，原始关键字会报 Unsupported color format', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        expect(getShaderColorFromString('transparent')).toEqual([0.5, 0.5, 0.5, 1]);
        expect(error).toHaveBeenCalledWith('Unsupported color format', 'transparent');

        const shaderColor = getShaderColorFromString(normalizeThemeColor('transparent'));
        expect(shaderColor).toEqual([0, 0, 0, 0]);
        expect(error).toHaveBeenCalledTimes(1);
        // 8 位 hex 归一化后同样是合法 rgba，shader 不会再报格式错误
        expect(getShaderColorFromString(normalizeThemeColor('#00000000'))).toEqual([0, 0, 0, 0]);
        expect(warn).not.toHaveBeenCalled();
        expect(error).toHaveBeenCalledTimes(1);
    });

    it('THREE.Color 接受 toOpaqueHex 的结果（原始关键字会静默保留白色）', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const opaque = new ThreeColor(toOpaqueHex('transparent'));
        expect([opaque.r, opaque.g, opaque.b]).toEqual([0, 0, 0]);
        expect(warn).not.toHaveBeenCalled();

        // 直接喂关键字：Three 只支持 140 个具名色，transparent 不在其中 -> 保留默认白色
        const raw = new ThreeColor('transparent');
        expect([raw.r, raw.g, raw.b]).toEqual([1, 1, 1]);
        expect(warn).toHaveBeenCalled();
    });
});
