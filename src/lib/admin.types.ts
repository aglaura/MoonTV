export type UserRole = 'user' | 'admin' | 'owner';

export interface User {
  username: string;
  role: UserRole;
  avatar?: string;
  banned?: boolean;
  group?: string;
}

export interface DataSource {
  key: string;
  name: string;
  api?: string;
  m3u8?: string;
  detail?: string;
  from: 'config' | 'custom';
  disabled?: boolean;
}

export interface ValuationWeights {
  quality: number;
  speed: number;
  ping: number;
}

export interface AdminConfig {
  SiteConfig: {
    SiteName: string;
    Announcement: string;
    SearchDownstreamMaxPage: number;
    SiteInterfaceCacheTime: number;
    ImageProxy: string;
  };
  UserConfig: {
    AllowRegister: boolean;
    Users: User[];
  };
  SourceConfig: DataSource[];
  ValuationWeights?: ValuationWeights;
}

export interface AdminConfigResult {
  Role: 'owner' | 'admin';
  Config: AdminConfig;
}
