import type { EditablePack, ListPackOptions, PackPage, PublicPack } from "./types";

export interface PackRepository {
  createPack(pack: EditablePack): Promise<PublicPack>;
  updatePack(pack: PublicPack): Promise<PublicPack>;
  deletePack(packId: string): Promise<void>;
  reportPack(packId: string): Promise<void>;
  getPack(packId: string): Promise<PublicPack | null>;
  listPacks(options?: ListPackOptions): Promise<PackPage>;
}
