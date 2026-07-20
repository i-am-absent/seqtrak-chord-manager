import type { EditablePack, ListPackOptions, PackPage, PublicPack, SearchPackOptions } from "./types";

export interface PackRepository {
  ownsPack(packId: string): boolean;
  createPack(pack: EditablePack): Promise<PublicPack>;
  updatePack(pack: PublicPack): Promise<PublicPack>;
  deletePack(packId: string): Promise<void>;
  reportPack(packId: string): Promise<void>;
  getPack(packId: string): Promise<PublicPack | null>;
  listPacks(options?: ListPackOptions): Promise<PackPage>;
  searchPacks(options: SearchPackOptions): Promise<PackPage>;
}
