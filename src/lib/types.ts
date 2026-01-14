import { AdminConfig } from './admin.types';

// 播放紀錄資料結構
export interface PlayRecord {
  title: string; // 中文片名
  source_name: string; // 來源名稱
  source_list?: string[]; // 可用來源列表
  cover: string; // 海報
  year: string; // 年份
  index: number; // 第幾集
  total_episodes: number; // 總集數
  play_time: number; // 播放進度（秒）
  total_time: number; // 總長度（秒）
  save_time: number; // 記錄保存時間（時間戳）
  search_title: string; // 搜尋時使用的標題
  // Optional metadata for English/IMDb and Douban linkage
  imdbId?: string; // IMDb id like 'tt1234567' or douban-specific 'imdbt...'
  imdbTitle?: string; // Scraped English title from IMDb
  douban_id?: number; // Douban subject id if available
}

// 收藏資料結構
export interface Favorite {
  source_name: string; // 來源名稱
  source_list?: string[]; // 可用來源列表
  total_episodes: number; // 總集數
  title: string; // 中文片名
  year: string; // 年份
  cover: string; // 海報
  save_time: number; // 記錄保存時間（時間戳）
  search_title: string; // 搜尋時使用的標題
  // Optional metadata for English/IMDb and Douban linkage
  imdbId?: string;
  imdbTitle?: string;
  douban_id?: number;
}

export interface SourceValuation {
  key: string;
  source: string;
  id?: string;
  quality: string;
  loadSpeed: string;
  pingTime: number;
  qualityRank?: number;
  speedValue?: number;
  sampleCount?: number;
  /** Higher value means higher priority based on latest sorting */
  priorityScore?: number;
  updated_at: number;
}

// 存儲介面
export interface IStorage {
  // 播放紀錄相關
  getPlayRecord(userName: string, key: string): Promise<PlayRecord | null>;
  setPlayRecord(
    userName: string,
    key: string,
    record: PlayRecord
  ): Promise<void>;
  getAllPlayRecords(userName: string): Promise<{ [key: string]: PlayRecord }>;
  deletePlayRecord(userName: string, key: string): Promise<void>;

  // 收藏相關
  getFavorite(userName: string, key: string): Promise<Favorite | null>;
  setFavorite(userName: string, key: string, favorite: Favorite): Promise<void>;
  getAllFavorites(userName: string): Promise<{ [key: string]: Favorite }>;
  deleteFavorite(userName: string, key: string): Promise<void>;

  // 使用者相關
  registerUser(userName: string, password: string): Promise<void>;
  verifyUser(userName: string, password: string): Promise<boolean>;
  checkUserExist(userName: string): Promise<boolean>;
  changePassword(userName: string, newPassword: string): Promise<void>;
  renameUser?(oldUserName: string, newUserName: string): Promise<void>;
  deleteUser(userName: string): Promise<void>;

  // 搜尋歷史
  getSearchHistory(userName: string): Promise<string[]>;
  addSearchHistory(userName: string, keyword: string): Promise<void>;
  deleteSearchHistory(userName: string, keyword?: string): Promise<void>;

  // 使用者列表
  getAllUsers(): Promise<string[]>;

  // 管理員設定
  getAdminConfig(): Promise<AdminConfig | null>;
  setAdminConfig(config: AdminConfig): Promise<void>;

  // 播放源評估
  getSourceValuation?(key: string): Promise<SourceValuation | null>;
  setSourceValuation?(valuation: SourceValuation): Promise<void>;
  getSourceValuations?(
    keys: string[]
  ): Promise<Record<string, SourceValuation>>;
  getAllSourceValuations?(): Promise<SourceValuation[]>;
}

// 搜尋結果資料結構
export interface SearchResult {
  id: string;
  title: string; // 中文片名
  original_title?: string; // 英文片名（可選）
  poster: string;
  posterAlt?: string[];
  posterDouban?: string;
  posterTmdb?: string;
  doubanUrl?: string;
  tmdbUrl?: string;
  episodes: string[];
  providerLinks?: Array<{ key: string; name: string; url?: string }>;
  sourceLinks?: Array<{
    provider: string;
    id: string;
    title?: string;
    episodes: string[];
    playUrl?: string;
    poster?: string;
  }>;
  source: string;
  source_name: string;
  class?: string;
  rate?: string;
  year: string;
  desc?: string;
  type_name?: string;
  douban_id?: number;
  // Optional metrics populated when valuations are available
  quality?: string;
  loadSpeed?: string;
  speedValue?: number;
  pingTime?: number;
  // Verification note (e.g., year mismatch, episode count mismatch)
  verifyReason?: string;
}

// 豆瓣資料結構
export interface DoubanItem {
  id: string;
  title: string; // 中文片名
  original_title?: string; // 英文片名（可選）
  poster: string;
  rate: string;
  year: string;
   /** Optional metadata parsed from Douban card_subtitle (e.g., region string) */
   subtitle?: string;
   region?: string; // cn, hk, tw, kr, jp, other
}

// 豆瓣查詢結果
export interface DoubanResult {
  code: number;
  message: string;
  list: DoubanItem[];
}

export interface DoubanSubjectDetail {
  id: string;
  title: string;
  original_title?: string;
  year?: string;
  imdbId?: string;
  imdbTitle?: string;
  actors?: string[];
  directors?: string[];
  genres?: string[];
  countries?: string[];
  languages?: string[];
  episodes?: number;
  durations?: string[];
  releaseDates?: string[];
}
