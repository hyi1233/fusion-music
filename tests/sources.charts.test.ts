import { describe, it, expect } from 'vitest';
import { parseRankList, parseRankSongs, BUILTIN_CHARTS } from '../src/sources/charts';
import { toTrack } from '../src/sources/search';

describe('parseRankList', () => {
  it('解析榜单目录', () => {
    const charts = parseRankList({
      rank: { list: [{ rankid: 8888, rankname: 'TOP500' }, { rankid: '74534', rankname: '新歌榜' }, {}] },
    });
    expect(charts).toEqual([
      { id: '8888', name: 'TOP500' },
      { id: '74534', name: '新歌榜' },
    ]);
  });
  it('空数据返回空数组', () => {
    expect(parseRankList({})).toEqual([]);
  });
});

describe('parseRankSongs', () => {
  it('filename 优先拆歌手/歌名', () => {
    const songs = parseRankSongs({
      songs: {
        list: [
          {
            hash: 'ABC123',
            filename: '高冷 - 后来的我和你',
            album_id: '213029038',
            duration_high: 219,
            authors: [{ author_name: '高冷' }],
          },
        ],
      },
    });
    expect(songs[0]).toMatchObject({
      id: 'ABC123',
      title: '后来的我和你',
      artist: '高冷',
      duration: 219,
      source: 'kugou',
    });
  });

  it('无 filename 时用 authors+songname', () => {
    const songs = parseRankSongs({
      songs: { list: [{ hash: 'H2', songname: '晴天', authors: [{ author_name: '周杰伦' }, { author_name: 'Feist' }] }] },
    });
    expect(songs[0]).toMatchObject({ title: '晴天', artist: '周杰伦/Feist' });
  });

  it('过滤无 hash 条目', () => {
    const songs = parseRankSongs({ songs: { list: [{ songname: 'x' }, { hash: 'H3', songname: 'y' }] } });
    expect(songs).toHaveLength(1);
  });
});

describe('榜单 → 播放队列', () => {
  it('toTrack 组合 kugou:hash（复用 t3 契约）', () => {
    const [song] = parseRankSongs({ songs: { list: [{ hash: 'XYZ', filename: 'A - B' }] } });
    const track = toTrack(song);
    expect(track.id).toBe('kugou:XYZ');
    expect(track.url).toBe('');
  });
});

describe('BUILTIN_CHARTS', () => {
  it('含新歌榜与热歌类榜单', () => {
    const names = BUILTIN_CHARTS.map(c => c.name).join();
    expect(names).toContain('新歌榜');
    expect(names).toContain('热歌');
  });
});
