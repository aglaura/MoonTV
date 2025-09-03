import { AdminConfig } from './admin.types';

// 播放記錄資料結構
export interface PlayRecord {
  title: string;           // 中文片名
  source_name: string;     // 來源名稱
  cover: string;           // 海報封面
  year: string;            // 年份
  index: number;           // 第幾集
  total_episodes: number;  // 總集數
  play_time: number;       // 播放進度（秒）
  total_time: number;      // 總長度（秒）
  save_time: number;       // 記錄保存時間（時間戳）
  search_title: string;    // 搜索時使用的標題
}

// 收藏資料結構
export interface Favorite {
  source_name: string;     // 來源名稱
  total_episodes: number;  // 總集數
  title: string;           // 中文片名
  year: string;            // 年份
  cover: string;           // 海報封面
  save_time: number;       // 記錄保存時間（時間戳）
  search_title: string;    // 搜索時使用的標題
}

// 存儲介面
export interface IStorage {
  // 播放記錄相關
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
  checkUserExist(userName: string): Promise<boolean>; // 檢查使用者是否存在（無需密碼）
  changePassword(userName: string, newPassword: string): Promise<void>;
  deleteUser(userName: string): Promise<void>; // 刪除使用者（包含密碼、搜尋歷史、播放記錄、收藏）

  // 搜尋歷史相關
  getSearchHistory(userName: string): Promise<string[]>;
  addSearchHistory(userName: string, keyword: string): Promise<void>;
  deleteSearchHistory(userName: string, keyword?: string): Promise<void>;

  // 使用者列表
  getAllUsers(): Promise<string[]>;

  // 管理員配置相關
  getAdminConfig(): Promise<AdminConfig | null>;
  setAdminConfig(config: AdminConfig): Promise<void>;
}

// 搜尋結果資料結構
export interface SearchResult {
  id: string;                // 唯一 ID
  title: string;             // 中文片名
  original_title?: string;   // 英文片名（可選）
  poster: string;            // 海報
  episodes: string[];        // 集數陣列
  source: string;            // 來源
  source_name: string;       // 來源名稱
  class?: string;            // 分類（可選）
  year: string;              // 年份
  desc?: string;             // 簡介（可選）
  type_name?: string;        // 類型名稱（可選）
  douban_id?: number;        // 豆瓣 ID（可選）
}

// 豆瓣資料結構
export interface DoubanItem {
  id: string;
  title: string;
  poster: string;
  rate: string;
  year: string;
}

export interface DoubanResult {
  code: number;
  message: string;
  list: DoubanItem[];
}
