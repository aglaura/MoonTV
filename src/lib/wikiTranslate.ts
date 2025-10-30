/**
 * Detect if a text is in English
 */
export function isEnglishText(text: string): boolean {
  // Check if the text contains mostly Latin characters
  const latinChars = text.match(/[a-zA-Z\s\d\W]/g);
  return latinChars ? latinChars.length / text.length > 0.7 : false;
}

/**
 * Get simplified Chinese title from English title using Wikipedia API
 */
export async function getSimplifiedChineseTitleFromEnglish(
  englishTitle: string
): Promise<string | null> {
  try {
    // Format the title for Wikipedia API
    const formattedTitle = englishTitle.trim().replace(/\s+/g, '_');
    
    // Check if there are language links to Chinese Wikipedia
    const langResponse = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/langlinks/${encodeURIComponent(formattedTitle)}?lang=zh`
    );
    
    if (!langResponse.ok) {
      return null;
    }
    
    const langData = await langResponse.json();
    
    if (langData.length > 0 && langData[0].title) {
      // Return the Chinese title
      return langData[0].title;
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching Chinese title from Wikipedia:', error);
    return null;
  }
}

/**
 * Detect if a text is in Chinese
 */
export function isChineseText(text: string): boolean {
  // Check if the text contains Chinese characters
  const chineseChars = text.match(/[\u4e00-\u9fa5]/g);
  return chineseChars ? chineseChars.length > 0 : false;
}