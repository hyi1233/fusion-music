// tests/sources.resolve.test.ts — 播放地址多源降级链（单测）
//
// 覆盖：降级顺序、每源失败原因、错误条需要的 attempts 结构。

import { describe, expect, it, vi } from 'vitest';
import {
  classifyError,
  lxSourceOf,
  platformOf,
  ResolveAllFailedError,
  resolvePlayUrlWithFallback,
  songIdOf,
} from '../src/sources/resolve';
import { IpBanError, RateLimitError, SourceError } from '../src/sources/types';
import type { Track } from '../src/types/music';

const track = (id: string, extra: Partial<Track> = {}): Track => ({
  id,
  title: 't',
  artist: 'a',
  album: '',
  duration: 210,
  cover: '',
  url: '',
  ...extra,
});

describe('平台/音源映射', () => {
  it('id 前缀映射到平台与洛雪 source', () => {
    expect(platformOf(track('kuwo:123'))).toBe('kuwo');
    expect(platformOf(track('kugou:abc'))).toBe('kugou');
    expect(platformOf(track('qq:mid'))).toBe('qq');
    expect(lxSourceOf(track('kuwo:123'))).toBe('kw');
    expect(lxSourceOf(track('kugou:abc'))).toBe('kg');
    expect(lxSourceOf(track('qq:mid'))).toBe('tx');
    expect(songIdOf(track('kuwo:123'))).toBe('123');
  });

  it('未知平台抛 UNKNOWN_SOURCE', () => {
    expect(() => platformOf(track('spotify:x'))).toThrow(/未知音源/);
  });
});

describe('错误分类', () => {
  it('平台错误保留原 code 与 message', () => {
    expect(classifyError(new IpBanError('被封')).code).toBe('IP_BANNED');
    expect(classifyError(new RateLimitError('太频繁')).code).toBe('RATE_LIMITED');
    expect(classifyError(new SourceError('X', '自定义')).reason).toBe('自定义');
  });

  it('普通异常按关键字归类', () => {
    expect(classifyError(new Error('403 Forbidden')).code).toBe('IP_BANNED');
    expect(classifyError(new Error('HTTP 429')).code).toBe('RATE_LIMITED');
    expect(classifyError(new Error('404')).code).toBe('HTTP_404');
    expect(classifyError(new Error('boom')).code).toBe('OTHER');
  });
});

describe('多源降级', () => {
  it('自带 url 直接命中，不请求任何源', async () => {
    const fetchImpl = vi.fn();
    const res = await resolvePlayUrlWithFallback(track('kuwo:1', { url: 'https://direct.mp3' }), '128k', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(res.url).toBe('https://direct.mp3');
    expect(res.source).toBe('直链');
    expect(res.attempts).toEqual([{ source: '直链', ok: true, id: 'direct' }]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('自定义脚本优先，失败后降级到默认源', async () => {
    const order: string[] = [];
    const res = await resolvePlayUrlWithFallback(track('kuwo:1'), '128k', {
      loadCustomScriptImpl: async () => {
        order.push('custom');
        return 'custom-script';
      },
      loadDefaultScriptImpl: async () => {
        order.push('default');
        return 'default-script';
      },
      scriptResolver: async script => {
        if (script === 'custom-script') throw new Error('自定义源挂了');
        return 'https://default.mp3';
      },
      fetchImpl: (async () => new Response('')) as unknown as typeof fetch,
    });
    expect(order).toEqual(['custom', 'default']);
    expect(res.source).toBe('默认洛雪源');
    expect(res.attempts[0]).toMatchObject({ source: '自定义脚本', ok: false, id: 'custom' });
    expect(res.attempts[1]).toMatchObject({ source: '默认洛雪源', ok: true, id: 'default' });
  });

  it('自定义脚本加载本身失败也要记录，并继续往下走', async () => {
    const res = await resolvePlayUrlWithFallback(track('kuwo:1'), '128k', {
      loadCustomScriptImpl: async () => {
        throw new SourceError('SCRIPT_INVALID', '脚本内容异常');
      },
      loadDefaultScriptImpl: async () => 'default-script',
      scriptResolver: async () => 'https://default.mp3',
      fetchImpl: (async () => new Response('')) as unknown as typeof fetch,
    });
    expect(res.attempts[0]).toMatchObject({ ok: false, id: 'custom', code: 'SCRIPT_INVALID' });
    expect(res.url).toBe('https://default.mp3');
  });

  it('两个脚本都失败时走平台原生兜底', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ url: 'https://native.mp3' })));
    const res = await resolvePlayUrlWithFallback(track('kuwo:474678847'), '128k', {
      loadCustomScriptImpl: async () => null,
      loadDefaultScriptImpl: async () => {
        throw new SourceError('IP_BANNED', '禁止批量下载');
      },
      scriptResolver: async () => {
        throw new Error('不该被调用');
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(res.source).toBe('kuwo 原生接口');
    expect(res.attempts.map(a => a.id)).toEqual(['default', 'native']);
    expect(String(fetchImpl.mock.calls[0][0])).toContain('/native/kuwo/anti/s');
  });

  it('全部失败时抛 ResolveAllFailedError，attempts 带每个源的原因', async () => {
    const fetchImpl = vi.fn(async () => new Response('forbidden', { status: 403 }));
    let caught: unknown;
    try {
      await resolvePlayUrlWithFallback(track('kugou:hash'), '128k', {
        loadCustomScriptImpl: async () => 'custom',
        loadDefaultScriptImpl: async () => 'default',
        scriptResolver: async () => {
          throw new Error('脚本取链失败');
        },
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ResolveAllFailedError);
    const err = caught as ResolveAllFailedError;
    expect(err.code).toBe('ALL_SOURCES_FAILED');
    expect(err.attempts.map(a => a.id)).toEqual(['custom', 'default', 'native']);
    expect(err.attempts.every(a => !a.ok)).toBe(true);
    expect(err.message).toContain('自定义脚本');
    expect(err.message).toContain('默认洛雪源');
    expect(err.message).toContain('kugou 原生接口');
  });
});
