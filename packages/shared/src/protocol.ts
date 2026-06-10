import type { PartySlot } from './base';
import type { BattleSummary } from './battle';
import type { RealtimeBinaryPayload, RealtimeEncoding } from './realtime-codec';
import type {
  RoomMechanicOptions,
  RoomRuleOptions,
  RoomSlotState,
  RoomStateDto,
  RoomSummaryDto,
} from './room';
import type {
  ContinuousSimulationInputFrame,
  EncounterResult,
  SimulationSnapshot,
  UseKnockbackImmuneSimulationInput,
  UseSprintSimulationInput,
} from './simulation';
import type { SimulationEvent } from './events';

export interface RoomJoinPayload {
  roomId: string;
  userId: string;
  password?: string;
  mode?: 'player' | 'spectator';
  slot?: PartySlot;
  userName?: string;
  realtimeEncoding?: RealtimeEncoding;
}

export interface RoomLeavePayload {
  roomId: string;
}

export interface RoomSelectBattlePayload {
  roomId: string;
  battleId: string;
}

export interface RoomSwitchSlotPayload {
  roomId: string;
  targetSlot: PartySlot;
}

export interface RoomSpectatePayload {
  roomId: string;
}

export interface RoomStartPayload {
  roomId: string;
  countdownMs?: number;
  startTimeMs?: number;
}

export interface RoomQuickFailPayload {
  roomId: string;
}

export interface RoomResetPayload {
  roomId: string;
}

export interface RoomKickPayload {
  roomId: string;
  targetUserId: string;
}

export interface RoomSetSlotOccupantPayload {
  roomId: string;
  slot: PartySlot;
  occupantType: 'empty' | 'bot';
}

export interface RoomUpdateOptionsPayload {
  roomId: string;
  options?: Partial<RoomRuleOptions>;
  mechanicOptions?: Partial<RoomMechanicOptions>;
}

export interface RoomStatePayload {
  room: RoomStateDto;
}

export interface RoomSlotsPayload {
  roomId: string;
  slots: RoomSlotState[];
}

export interface RoomCountdownPayload {
  roomId: string;
  remainingSeconds: number;
}

export interface SimStartPayload {
  roomId: string;
  syncId: number;
  snapshot: SimulationSnapshot;
}

export interface SimSnapshotPayload {
  roomId: string;
  syncId: number;
  snapshot: SimulationSnapshot;
  reason: 'join' | 'rejoin' | 'resync' | 'waiting-state' | 'tick' | 'battle-end' | 'battle-start';
}

export interface SimEventsPayload {
  roomId: string;
  syncId: number;
  events: SimulationEvent[];
}

export interface ActorPoseDiff {
  slotIndex: number;
  x: number;
  y: number;
  facing: number;
}

export interface SimPoseDiffPayload {
  roomId: string;
  tick: number;
  timeMs: number;
  poses: ActorPoseDiff[];
}

export interface SimEndPayload {
  roomId: string;
  latestResult: EncounterResult;
}

export interface RoomClosedPayload {
  roomId: string;
  reason: string;
}

export interface RoomKickedPayload {
  roomId: string;
  reason: string;
}

export interface SimResyncRequestPayload {
  roomId: string;
  reason?: string;
}

export interface ServerErrorPayload {
  code: string;
  message: string;
}

export interface LobbyDataPayload {
  roomPasswordRequired: boolean;
  battles: BattleSummary[];
  rooms: RoomSummaryDto[];
}

export interface RoomCreatePayload {
  name: string;
  ownerUserId: string;
  ownerName: string;
  battleId?: string;
  password?: string;
}

export interface RoomCreateResponse {
  success: boolean;
  roomId?: string;
  code?: string;
  message?: string;
}

export interface ServerToClientEvents {
  'room:state': (payload: RoomStatePayload) => void;
  'room:slots': (payload: RoomSlotsPayload) => void;
  'room:countdown': (payload: RoomCountdownPayload) => void;
  'sim:start': (payload: SimStartPayload | RealtimeBinaryPayload) => void;
  'sim:snapshot': (payload: SimSnapshotPayload | RealtimeBinaryPayload) => void;
  'sim:events': (payload: SimEventsPayload | RealtimeBinaryPayload) => void;
  'sim:pose-diff': (payload: SimPoseDiffPayload | RealtimeBinaryPayload) => void;
  'sim:end': (payload: SimEndPayload) => void;
  'room:closed': (payload: RoomClosedPayload) => void;
  'room:kicked': (payload: RoomKickedPayload) => void;
  'server:error': (payload: ServerErrorPayload) => void;
  'lobby:data': (payload: LobbyDataPayload) => void;
}

export interface ClientToServerEvents {
  'room:join': (payload: RoomJoinPayload) => void;
  'room:leave': (payload: RoomLeavePayload) => void;
  'room:select-battle': (payload: RoomSelectBattlePayload) => void;
  'room:switch-slot': (payload: RoomSwitchSlotPayload) => void;
  'room:spectate': (payload: RoomSpectatePayload) => void;
  'room:start': (payload: RoomStartPayload) => void;
  'room:update-options': (payload: RoomUpdateOptionsPayload) => void;
  'room:quick-fail': (payload: RoomQuickFailPayload) => void;
  'room:reset': (payload: RoomResetPayload) => void;
  'room:kick': (payload: RoomKickPayload) => void;
  'sim:input-frame': (payload: ContinuousSimulationInputFrame | RealtimeBinaryPayload) => void;
  'sim:use-knockback-immune': (payload: UseKnockbackImmuneSimulationInput) => void;
  'sim:use-sprint': (payload: UseSprintSimulationInput) => void;
  'sim:request-resync': (payload: SimResyncRequestPayload) => void;
  'lobby:get-data': () => void;
  'room:create': (
    payload: RoomCreatePayload,
    callback: (response: RoomCreateResponse) => void,
  ) => void;
  'room:set-slot-occupant': (payload: RoomSetSlotOccupantPayload) => void;
}
