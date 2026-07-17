import type { ChordSlot, KeyName } from "../domain/music";

export interface EditablePack {
  packName: string;
  authorName: string;
  tags: string[];
  key: KeyName;
  trackSoundName: string;
  sourceTrackIndex?: number;
  chords: ChordSlot[];
}

export interface PublicPack extends EditablePack {
  id: string;
  createdAt: string;
  updatedAt: string;
  reportedCount: number;
}

export interface PackCursor {
  createdAt: string;
  id: string;
}

export interface PackPage {
  items: PublicPack[];
  nextCursor: PackCursor | null;
}

export interface ListPackOptions {
  limit?: number;
  cursor?: PackCursor;
}
