// Message bus abstraction used by the "Firebase transport": the host's browser is the game server,
// other devices talk to it through a shared queue. Everything on the bus is end-to-end encrypted.
export type Unsub = () => void;
export interface Meta { epoch: string; hb: number; created: number; v: number; /** set by the host right before deleting the room */ closed?: boolean }

export interface Bus {
  getMeta(code: string): Promise<Meta | null>;
  setMeta(code: string, meta: Meta): Promise<void>;
  beat(code: string, hb: number): Promise<void>;
  onMeta(code: string, cb: (m: Meta | null) => void): Unsub;
  /** device -> host */
  pushToHost(code: string, device: string, enc: string): Promise<void>;
  /** host only: delivers every queued message in order and deletes it after delivery */
  onHostQueue(code: string, cb: (device: string, enc: string) => void): Unsub;
  /** host -> device */
  pushToDevice(code: string, device: string, enc: string): Promise<void>;
  onDeviceQueue(code: string, device: string, cb: (enc: string) => void): Unsub;
  saveSnapshot(code: string, enc: string): Promise<void>;
  loadSnapshot(code: string): Promise<string | null>;
  saveVm(code: string, seat: number, enc: string): Promise<void>;
  loadVms(code: string): Promise<[number, string][]>;
  removeRoom(code: string): Promise<void>;
}

export interface Wire { send(m: import('../../shared/types').ClientMsg): void; close(): void }
