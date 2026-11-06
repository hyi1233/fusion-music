import { describe, it, expect, vi } from 'vitest';
import { parseKuwo, parseKugou, parseQq, searchAll, toTrack, platformName } from '../src/sources/search';
import { IpBanError, RateLimitError, SourceError } from '../src/sources/types';

const KUWO_BODY = `var x = ${JSON.stringify({
  abslist: [
    { MUSICRID: 'MUSIC_123', SONGNAME: '晴天', ARTIST: '周杰伦', ALBUM: '叶惠美', DURATION: '269' },
    { MUSICRID: 'MUSIC_456', SONGNAME: '七里香' },
  ],
})};`;

describe('parseKuwo', () => {
  it('剥前缀解析裸 JS 并映射字段', () => {
    const songs = parseKuwo(KUWO_BODY);
    expect(songs).toHaveLength(2);
    expect(songs[0]).toEqual({
      id: '123', title: '晴天', artist: '周杰伦', album: '叶惠美', duration: 269, source: 'kuwo',
    });
    expect(songs[1].duration).toBe(0);
  });
  it('无 JSON 时抛 PARSE', () => {
    expect(() => parseKuwo('garbage')).toThrow(SourceError);
  });
});

describe('parseKugou', () => {
  it('剥离 HTML 标签并映射', () => {
    const songs = parseKugou({
      status: 1,
      data: { lists: [{ FileHash: 'h1', SongName: '<em>稻香</em>', SingerName: '周杰伦', Duration: 223 }] },
    });
    expect(songs[0]).toMatchObject({ id: 'h1', title: '稻香', duration: 223, source: 'kugou' });
  });
});

describe('parseQq', () => {
  it('合并歌手', () => {
    const songs = parseQq({
      code: 0,
      data: { song: { list: [{ songmid: 'm1', songname: '夜曲', singer: [{ name: '周杰伦' }, { name: 'Feist' }], interval: 226 }] } },
    });
    expect(songs[0]).toMatchObject({ id: 'm1', artist: '周杰伦/Feist', source: 'qq' });
  });
});

// searchAll 网络层测试：mock httpText/httpJson
vi.mock('../src/sources/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/sources/http')>();
  return { ...actual, httpText: vi.fn(), httpJson: vi.fn() };
});
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { httpText, httpJson } from '../src/sources/http';
const httpTextMock = vi.mocked(httpText);
const httpJsonMock = vi.mocked(httpJson);
beforeEach(() => {
  httpTextMock.mockReset();
  httpJsonMock.mockReset();
});

describe('searchAll', () => {
  it('酷我成功即返回，不请求后续平台', async () => {
    httpTextMock.mockResolvedValue({ status: 200, body: KUWO_BODY });
    const { platform, songs } = await searchAll('周杰伦');
    expect(platform).toBe('kuwo');
    expect(songs).toHaveLength(2);
    expect(httpJsonMock).not.toHaveBeenCalled();
  });

  it('酷我空结果降级酷狗', async () => {
    httpTextMock.mockResolvedValue({ status: 200, body: '{"abslist":[]}' });
    httpJsonMock.mockResolvedValue({ status: 1, data: { lists: [{ FileHash: 'h2', SongName: '晴天' }] } });
    const { platform } = await searchAll('晴天');
    expect(platform).toBe('kugou');
  });

  it('全部失败抛最后的错误', async () => {
    httpTextMock.mockRejectedValue(new SourceError('HTTP_ERROR', 'x'));
    httpJsonMock.mockRejectedValue(new SourceError('PLATFORM', 'y'));
    await expect(searchAll('q')).rejects.toThrow('y');
  });

  it('封 IP 不降级直接抛 IpBanError', async () => {
    httpTextMock.mockRejectedValue(new IpBanError());
    await expect(searchAll('q')).rejects.toBeInstanceOf(IpBanError);
    expect(httpJsonMock).not.toHaveBeenCalled();
  });

  it('限流不降级直接抛 RateLimitError', async () => {
    httpTextMock.mockRejectedValue(new RateLimitError());
    await expect(searchAll('q')).rejects.toBeInstanceOf(RateLimitError);
  });

  it('空关键词直接返回空', async () => {
    const { songs } = await searchAll('  ');
    expect(songs).toHaveLength(0);
  });
});

describe('toTrack', () => {
  it('id 组合 source:platformId，url 留空', () => {
    const t = toTrack({ id: '123', title: '晴天', artist: '周杰伦', album: '叶惠美', duration: 269, source: 'kuwo' });
    expect(t.id).toBe('kuwo:123');
    expect(t.url).toBe('');
  });
});

describe('platformName', () => {
  it('映射中文名', () => {
    expect(platformName('kuwo')).toBe('酷我');
    expect(platformName('kugou')).toBe('酷狗');
    expect(platformName('qq')).toBe('QQ 音乐');
  });
});
