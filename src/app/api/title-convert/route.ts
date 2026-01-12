import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

interface WikipediaSearchResult {
  query?: {
    search?: Array<{
      title: string;
    }>;
  };
}

/**
 * Convert English title to Chinese title using Wikipedia search
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get('title');

  if (!title) {
    return NextResponse.json({ error: 'Missing title parameter' }, { status: 400 });
  }

  try {
    // Search Wikipedia for the title in Chinese
    const wikipediaApiUrl = `https://zh.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    
    const response = await fetch(wikipediaApiUrl, {
      headers: {
        'User-Agent': 'EsmeeTV/1.0',
      },
    });

    if (response.ok) {
      const data = await response.json();
      if (data && data.title) {
        return NextResponse.json({ 
          title: data.title,
          description: data.extract || null
        });
      }
    }

    // If direct lookup fails, try search API
    const searchUrl = `https://zh.wikipedia.org/w/api.php?action=query&format=json&list=search&srsearch=${encodeURIComponent(title)}&srlimit=1`;
    
    const searchResponse = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'EsmeeTV/1.0',
      },
    });

    if (searchResponse.ok) {
      const searchData: WikipediaSearchResult = await searchResponse.json();
      if (searchData.query?.search && searchData.query.search.length > 0) {
        const firstResult = searchData.query.search[0];
        return NextResponse.json({ 
          title: firstResult.title,
          description: null
        });
      }
    }

    // If all methods fail, return the original title
    return NextResponse.json({ 
      title: title,
      description: null
    });
  } catch (error) {
    // If there's an error, return the original title
    return NextResponse.json({ 
      title: title,
      description: null
    });
  }
}
