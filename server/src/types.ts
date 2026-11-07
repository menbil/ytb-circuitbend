export interface PlaylistItem {
  id: string;
  title: string;
  duration: number; // in seconds
  thumbnail: string;
  streamUrl: string;
  author?: string;
  isLocal?: boolean;
}

export interface PlaylistResponse {
  playlistTitle?: string;
  items: PlaylistItem[];
}

