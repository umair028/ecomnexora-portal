// YouTube Data API v3 (API key, public data only): channel stats + recent uploads.
// Docs: https://developers.google.com/youtube/v3/docs
const API = () => process.env.YOUTUBE_API_BASE || 'https://www.googleapis.com/youtube/v3';

async function get(path, params) {
  const key = process.env.YOUTUBE_API_KEY;
  const url = `${API()}/${path}?${new URLSearchParams({ ...params, key })}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`YouTube API: ${body.error?.message || r.status}`);
  return body;
}

// https://youtube.com/@handle · /channel/UC… · /c/name · /user/name
function parseChannelUrl(url) {
  let u; try { u = new URL(/^https?:\/\//i.test(url) ? url : 'https://' + url); } catch { return null; }
  const [first, second] = u.pathname.split('/').filter(Boolean);
  if (first && first.startsWith('@')) return { forHandle: first };
  if (first === 'channel' && second) return { id: second };
  if (first === 'user' && second) return { forUsername: second };
  if (first === 'c' && second) return { search: second };
  return null;
}

// ISO 8601 duration (PT1H2M3S) → "1:02:03" / "12:34"
function duration(iso = '') {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/) || [];
  const [hh, mm, ss] = [+(m[1] || 0), +(m[2] || 0), +(m[3] || 0)];
  return hh ? `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${mm}:${String(ss).padStart(2, '0')}`;
}

async function sync(account) {
  if (!process.env.YOUTUBE_API_KEY) {
    return { status: 'needs_setup', message: 'Add a YouTube Data API key as YOUTUBE_API_KEY in the portal settings (.env) to fetch channel data automatically.' };
  }
  const ref = parseChannelUrl(account.url);
  if (!ref) return { status: 'error', message: 'Use a channel link such as youtube.com/@channelname or youtube.com/channel/UC…' };

  let params = { part: 'snippet,statistics,contentDetails' };
  if (ref.search) {
    const s = await get('search', { part: 'snippet', type: 'channel', q: ref.search, maxResults: 1 });
    const id = s.items?.[0]?.id?.channelId;
    if (!id) return { status: 'error', message: 'Channel not found.' };
    params.id = id;
  } else Object.assign(params, ref);
  const ch = (await get('channels', params)).items?.[0];
  if (!ch) return { status: 'error', message: 'Channel not found.' };

  // latest uploads from the channel's uploads playlist
  let uploads = [];
  const playlist = ch.contentDetails?.relatedPlaylists?.uploads;
  if (playlist) {
    const items = (await get('playlistItems', { part: 'contentDetails', playlistId: playlist, maxResults: 8 })).items || [];
    const ids = items.map(i => i.contentDetails?.videoId).filter(Boolean);
    if (ids.length) {
      const videos = (await get('videos', { part: 'snippet,statistics,contentDetails,status', id: ids.join(',') })).items || [];
      uploads = videos.map(v => {
        const scheduled = v.status?.publishAt && new Date(v.status.publishAt) > new Date();
        return {
          title: String(v.snippet?.title || '').slice(0, 120),
          date: (scheduled ? v.status.publishAt : v.snippet?.publishedAt || '').slice(0, 10),
          views: scheduled ? null : Number(v.statistics?.viewCount ?? 0),
          length: duration(v.contentDetails?.duration),
          status: scheduled ? 'Scheduled' : v.status?.privacyStatus === 'public' ? 'Published' : 'Private',
        };
      }).sort((a, b) => b.date.localeCompare(a.date));
    }
  }
  const st = ch.statistics || {};
  const totalSubscribers = st.hiddenSubscriberCount ? null : Number(st.subscriberCount ?? 0);
  return {
    status: 'synced',
    message: `${Number(st.videoCount || 0).toLocaleString('en-US')} videos · ${totalSubscribers === null ? 'subscriber count hidden' : totalSubscribers.toLocaleString('en-US') + ' subscribers'}`,
    meta: { title: ch.snippet?.title || '', channelId: ch.id },
    patch: {
      channel: { totalSubscribers, lifetimeViews: Number(st.viewCount ?? 0), videoCount: Number(st.videoCount ?? 0), ...(uploads.length ? { uploads } : {}) },
    },
    preview: { title: ch.snippet?.title, totalSubscribers, lifetimeViews: Number(st.viewCount ?? 0), videoCount: Number(st.videoCount ?? 0), uploads: uploads.length },
  };
}

module.exports = { sync, parseChannelUrl, duration };
