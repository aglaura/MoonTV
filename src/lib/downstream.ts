import { API_CONFIG, ApiSite, getConfig } from '@/lib/config';
import { SearchResult } from '@/lib/types';
import { cleanHtmlTags } from '@/lib/utils';

// Robust extractor for m3u8 links from various upstream formats
function extractM3u8LinksFromText(text?: string): string[] {
  if (!text) return [];

  // Unescape common escapes that appear in some upstream payloads
    const s = text.replace(/\\u0026/g, '&').replace(/\\\//g, '/');

  const patterns: RegExp[] = [
    // match $http...m3u8 (common packing style)
    /\$(https?:\/\/[^\s"'()<>]+?\.m3u8(?:\?[^\s"'()]*)?)/gi,
    // match plain http...m3u8 with optional query
    /(https?:\/\/[^\s"'()<>]+?\.m3u8(?:\?[^\s"'()]*)?)/gi,
  ];

  const links = new Set<string>();

  for (const pat of patterns) {
    let m: RegExpExecArray | null;
    // eslint-disable-next-line no-cond-assign
    while ((m = pat.exec(s)) !== null) {
      const candidate = (m[1] || m[0] || '').trim();
      if (!candidate) continue;
      // Strip surrounding punctuation or trailing parentheses
      const cleaned = candidate.replace(/^\$+/, '').replace(/[)\]}.;,]+$/g, '');
      links.add(cleaned);
    }
  }

  return Array.from(links);
}

interface ApiSearchItem {
  vod_id: string;
  vod_name: string;
  vod_pic: string;
  vod_remarks?: string;
  vod_play_url?: string;
  vod_class?: string;
  vod_year?: string;
  vod_content?: string;
  vod_douban_id?: number;
  type_name?: string;
}

export async function searchFromApi(
  apiSite: ApiSite,
  query: string
): Promise<SearchResult[]> {
  try {
    const apiBaseUrl = apiSite.api;
    const apiUrl =
      apiBaseUrl + API_CONFIG.search.path + encodeURIComponent(query);
    const apiName = apiSite.name;

    // 添加超时处理
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(apiUrl, {
      headers: API_CONFIG.search.headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    if (
      !data ||
      !data.list ||
      !Array.isArray(data.list) ||
      data.list.length === 0
    ) {
      return [];
    }
    // 处理第一页结果
    const results = data.list.map((item: ApiSearchItem) => {
      let episodes: string[] = [];

      // 使用更健壮的提取器从 vod_play_url 中提取 m3u8 链接
      if (item.vod_play_url) {
        const vod_play_url_array = item.vod_play_url.split('$$$');
        // 对每个分片做提取，选择匹配数量最多的分片（保持原有行为）
        let best: string[] = [];
        vod_play_url_array.forEach((part: string) => {
          const matches = extractM3u8LinksFromText(part);
          if (matches.length > best.length) best = matches;
        });
        episodes = best;
      }

      // 如果上面没有找到，再尝试从 vod_content 中提取
      if ((!episodes || episodes.length === 0) && item.vod_content) {
        episodes = extractM3u8LinksFromText(item.vod_content);
      }

      return {
        id: item.vod_id.toString(),
        title: item.vod_name.trim().replace(/\s+/g, ' '),
        poster: item.vod_pic,
        episodes,
        source: apiSite.key,
        source_name: apiName,
        class: item.vod_class,
        year: item.vod_year
          ? item.vod_year.match(/\d{4}/)?.[0] || ''
          : 'unknown',
        desc: cleanHtmlTags(item.vod_content || ''),
        type_name: item.type_name,
        douban_id: item.vod_douban_id,
      };
    });

    const config = await getConfig();
    const MAX_SEARCH_PAGES: number = config.SiteConfig.SearchDownstreamMaxPage;

    // 获取总页数
    const pageCount = data.pagecount || 1;
    // 确定需要获取的额外页数
    const pagesToFetch = Math.min(pageCount - 1, MAX_SEARCH_PAGES - 1);

    // 如果有额外页数，获取更多页的结果
    if (pagesToFetch > 0) {
      const additionalPagePromises = [];

      for (let page = 2; page <= pagesToFetch + 1; page++) {
        const pageUrl =
          apiBaseUrl +
          API_CONFIG.search.pagePath
            .replace('{query}', encodeURIComponent(query))
            .replace('{page}', page.toString());

        const pagePromise = (async () => {
          try {
            const pageController = new AbortController();
            const pageTimeoutId = setTimeout(
              () => pageController.abort(),
              8000
            );

            const pageResponse = await fetch(pageUrl, {
              headers: API_CONFIG.search.headers,
              signal: pageController.signal,
            });

            clearTimeout(pageTimeoutId);

            if (!pageResponse.ok) return [];

            const pageData = await pageResponse.json();

            if (!pageData || !pageData.list || !Array.isArray(pageData.list))
              return [];

            return pageData.list.map((item: ApiSearchItem) => {
              let episodes: string[] = [];

              // 更鲁棒地从 vod_play_url 提取 m3u8
              if (item.vod_play_url) {
                const vodParts = item.vod_play_url.split('$$$');
                let best: string[] = [];
                vodParts.forEach((p: string) => {
                  const m = extractM3u8LinksFromText(p);
                  if (m.length > best.length) best = m;
                });
                episodes = best;
              }

              // 如果仍然没有，则尝试从 vod_content 中提取
              if ((!episodes || episodes.length === 0) && item.vod_content) {
                episodes = extractM3u8LinksFromText(item.vod_content);
              }

              return {
                id: item.vod_id.toString(),
                title: item.vod_name.trim().replace(/\s+/g, ' '),
                poster: item.vod_pic,
                episodes,
                source: apiSite.key,
                source_name: apiName,
                class: item.vod_class,
                year: item.vod_year
                  ? item.vod_year.match(/\d{4}/)?.[0] || ''
                  : 'unknown',
                desc: cleanHtmlTags(item.vod_content || ''),
                type_name: item.type_name,
                douban_id: item.vod_douban_id,
              };
            });
          } catch (error) {
            return [];
          }
        })();

        additionalPagePromises.push(pagePromise);
      }

      // 等待所有额外页的结果
      const additionalResults = await Promise.all(additionalPagePromises);

      // 合并所有页的结果
      additionalResults.forEach((pageResults) => {
        if (pageResults.length > 0) {
          results.push(...pageResults);
        }
      });
    }

    return results;
  } catch (error) {
    return [];
  }
}

// 匹配 m3u8 链接的正则
const M3U8_PATTERN = /(https?:\/\/[^"'\s]+?\.m3u8)/g;

export async function getDetailFromApi(
  apiSite: ApiSite,
  id: string
): Promise<SearchResult> {
  if (apiSite.detail) {
    return handleSpecialSourceDetail(id, apiSite);
  }

  const detailUrl = `${apiSite.api}${API_CONFIG.detail.path}${id}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  const response = await fetch(detailUrl, {
    headers: API_CONFIG.detail.headers,
    signal: controller.signal,
  });

  clearTimeout(timeoutId);

  if (!response.ok) {
    throw new Error(`详情请求失败: ${response.status}`);
  }

  const data = await response.json();

  if (
    !data ||
    !data.list ||
    !Array.isArray(data.list) ||
    data.list.length === 0
  ) {
    throw new Error('获取到的详情内容无效');
  }

  const videoDetail = data.list[0];
  let episodes: string[] = [];

  // 处理播放源拆分，优先使用更健壮的提取器
  if (videoDetail.vod_play_url) {
    const playSources = videoDetail.vod_play_url.split('$$$');
    if (playSources.length > 0) {
      const mainSource = playSources[0];
      // 先尝试直接从主分片提取 m3u8 链接
      let found = extractM3u8LinksFromText(mainSource);
      if (found.length === 0) {
        // 如果没有直接发现链接，拆分 # 再试
        const episodeList = mainSource.split('#');
        for (const ep of episodeList) {
          const parts = ep.split('$');
          const candidate = parts.length > 1 ? parts[1] : parts[0];
          const m = extractM3u8LinksFromText(candidate);
          if (m.length > 0) {
            found.push(...m);
          }
        }
      }

      episodes = found.filter(Boolean);
    }
  }

  // 如果播放源为空，则尝试从内容中解析 m3u8（fallback）
  if ((!episodes || episodes.length === 0) && videoDetail.vod_content) {
    episodes = extractM3u8LinksFromText(videoDetail.vod_content);
  }

  return {
    id: id.toString(),
    title: videoDetail.vod_name,
    poster: videoDetail.vod_pic,
    episodes,
    source: apiSite.key,
    source_name: apiSite.name,
    class: videoDetail.vod_class,
    year: videoDetail.vod_year
      ? videoDetail.vod_year.match(/\d{4}/)?.[0] || ''
      : 'unknown',
    desc: cleanHtmlTags(videoDetail.vod_content),
    type_name: videoDetail.type_name,
    douban_id: videoDetail.vod_douban_id,
  };
}

async function handleSpecialSourceDetail(
  id: string,
  apiSite: ApiSite
): Promise<SearchResult> {
  const detailUrl = `${apiSite.detail}/index.php/vod/detail/id/${id}.html`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  const response = await fetch(detailUrl, {
    headers: API_CONFIG.detail.headers,
    signal: controller.signal,
  });

  clearTimeout(timeoutId);

  if (!response.ok) {
    throw new Error(`详情页请求失败: ${response.status}`);
  }

  const html = await response.text();
  let matches: string[] = [];

  // 优先使用更稳健的提取器直接从 html 中解析出所有 m3u8 链接
  matches = extractM3u8LinksFromText(html);

  // 提取标题
  const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
  const titleText = titleMatch ? titleMatch[1].trim() : '';

  // 提取描述
  const descMatch = html.match(
    /<div[^>]*class=["']sketch["'][^>]*>([\s\S]*?)<\/div>/
  );
  const descText = descMatch ? cleanHtmlTags(descMatch[1]) : '';

  // 提取封面
  const coverMatch = html.match(/(https?:\/\/[^"'\s]+?\.jpg)/g);
  const coverUrl = coverMatch ? coverMatch[0].trim() : '';

  // 提取年份
  const yearMatch = html.match(/>(\d{4})</);
  const yearText = yearMatch ? yearMatch[1] : 'unknown';

  return {
    id,
    title: titleText,
    poster: coverUrl,
    episodes: matches,
    source: apiSite.key,
    source_name: apiSite.name,
    class: '',
    year: yearText,
    desc: descText,
    type_name: '',
    douban_id: 0,
  };
}
