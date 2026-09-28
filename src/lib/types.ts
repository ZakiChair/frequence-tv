export interface Stream { url: string; label: string; quality: string; }
export interface Channel { id: string; name: string; logo: string; country: string; categories: string[]; languages: string[]; streams: Stream[]; website?: string; }
export interface Catalog { updatedAt: string; source: string; streamCount: number; channels: Channel[]; }
