<script setup lang="ts">
import type { SelectOption } from 'naive-ui';
import { NButton, NCard, NEmpty, NInputNumber, NModal, NSelect, NSwitch, NTag } from 'naive-ui';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type {
  BaseActorSnapshot,
  BattleArenaBackground,
  BattleRoomOptionDefinition,
  BattleStartTimeOptions,
  BossCastBarState,
  EncounterResult,
  PartySlot,
  RoomStateDto,
  SimulationSnapshot,
  StatusMetadata,
} from '@ff14arena/shared';
import {
  formatSkillCooldownLabel,
  getSlotCardBackground,
  isCooldownReady,
  getSlotRole,
  type OperationMode,
  type SelectValue,
} from '../../utils/ui';
import { loadPartyListOrder } from '../../utils/party-list-order';
import BattleStage from '../battle/BattleStage.vue';
const HUD_TICK_MS = 100;
const MIN_START_COUNTDOWN_SECONDS = 1;
const MAX_START_COUNTDOWN_SECONDS = 30;
const START_TIME_STEP_SECONDS = 0.25;

interface StartBattlePayload {
  countdownMs: number;
  startTimeMs?: number;
}

const props = defineProps<{
  room: RoomStateDto | null;
  snapshot: SimulationSnapshot | null;
  controlledActorId: string | null;
  currentPlayerSlot: PartySlot | null;
  cameraYaw: number;
  cameraZoom: number;
  operationMode: OperationMode;
  isOwner: boolean;
  isSpectating: boolean;
  canStart: boolean;
  startCountdownSeconds: number;
  startTimeSeconds: number;
  startTimeOptions: BattleStartTimeOptions | null;
  serverCountdownSeconds: number | null;
  battleStartNoticeUntilMs: number;
  logs: string[];
  latestResult: EncounterResult | null;
  arenaBackground: BattleArenaBackground | null;
  statusMetadata: StatusMetadata[];
  failedStatusIconUrls: string[];
  operationModeOptions: SelectOption[];
  battleRoomOptions: BattleRoomOptionDefinition[];
}>();

const emit = defineEmits<{
  useKnockbackImmune: [currentTimeMs: number];
  useSprint: [currentTimeMs: number];
  spectate: [];
  startBattle: [payload: StartBattlePayload];
  resetBattle: [];
  roomOptionsChange: [
    payload: {
      options?: Partial<RoomStateDto['options']>;
      mechanicOptions?: Partial<RoomStateDto['mechanicOptions']>;
    },
  ];
  startCountdownSecondsChange: [seconds: number];
  startTimeSecondsChange: [seconds: number];
  switchSlot: [slot: PartySlot];
  kickMember: [targetUserId: string];
  resetZoom: [];
  cameraYawChange: [yaw: number];
  cameraZoomChange: [zoom: number];
  faceAngle: [facing: number];
  operationModeChange: [value: SelectValue];
  statusIconLoadError: [iconUrl: string];
  setSlotOccupant: [
    payload: {
      slot: PartySlot;
      occupantType: 'empty' | 'bot';
    },
  ];
}>();

const hasEmptySlotHint = computed(() => {
  return props.room?.slots.some((slot) => slot.occupantType === 'empty') ?? false;
});

interface StatusViewModel {
  key: string;
  name: string;
  description: string;
  iconUrl: string | null;
  fallbackText: string;
  countdownLabel: string;
  title: string;
  iconFailed: boolean;
  partyListPriority: number;
  originalIndex: number;
}

const slotMap = computed(() => {
  const entries = props.room?.slots ?? [];
  return new Map(entries.map((slot) => [slot.slot, slot]));
});

const actorMap = computed(() => {
  const entries = props.snapshot?.actors ?? [];
  return new Map(entries.map((actor) => [actor.slot, actor]));
});

const castBars = computed(() => {
  const bars = props.snapshot?.hud.bossCastBars;

  if (bars !== undefined) {
    return bars;
  }

  const singleBar = props.snapshot?.hud.bossCastBar ?? null;

  return singleBar === null ? [] : [singleBar];
});
const hudNowMs = ref(0);
const renderClockBase = ref({
  snapshotTimeMs: 0,
  clientNowMs: 0,
});
const partyListOrder = ref<PartySlot[]>(loadPartyListOrder());
const localFailedStatusIconUrls = ref(new Set<string>());
const showSpectatorPanel = ref(true);
const showRoomSettingsPanel = ref(true);

// 开始模拟后自动收起观战和设置面板
watch(
  () => props.snapshot?.phase,
  (phase) => {
    if (phase !== 'waiting' && phase !== undefined) {
      showSpectatorPanel.value = false;
      showRoomSettingsPanel.value = false;
    }
  },
);
const pendingKickAction = ref<{
  targetUserId: string;
  targetName: string;
} | null>(null);
let hudTimer: number | null = null;

const renderSimulationTimeMs = computed(() => {
  if (props.snapshot === null) {
    return 0;
  }

  return (
    renderClockBase.value.snapshotTimeMs +
    Math.max(hudNowMs.value - renderClockBase.value.clientNowMs, 0)
  );
});

const currentActor = computed<BaseActorSnapshot | null>(() => {
  if (props.snapshot === null || props.controlledActorId === null) {
    return null;
  }

  return props.snapshot.actors.find((actor) => actor.id === props.controlledActorId) ?? null;
});
const statusMetadataMap = computed(
  () => new Map(props.statusMetadata.map((status) => [status.id, status])),
);
const failedStatusIconUrlSet = computed(
  () => new Set([...props.failedStatusIconUrls, ...localFailedStatusIconUrls.value]),
);
const currentActorStatuses = computed(() =>
  createStatusViewModels(currentActor.value?.statuses ?? []),
);

function getCastFillStyle(castBar: BossCastBarState): Record<string, string> {
  const elapsedMs = Math.min(
    Math.max(renderSimulationTimeMs.value - castBar.startedAt, 0),
    castBar.totalDurationMs,
  );
  const progress = castBar.totalDurationMs <= 0 ? 1 : elapsedMs / castBar.totalDurationMs;

  return {
    transform: `scaleX(${progress})`,
  };
}

const canUseKnockback = computed(
  () =>
    props.snapshot?.phase === 'running' &&
    currentActor.value !== null &&
    currentActor.value.mechanicActive &&
    isCooldownReady(currentActor.value.knockbackImmuneCooldown, renderSimulationTimeMs.value),
);
const canUseSprint = computed(
  () =>
    props.snapshot?.phase === 'running' &&
    currentActor.value !== null &&
    currentActor.value.mechanicActive &&
    isCooldownReady(currentActor.value.sprintCooldown, renderSimulationTimeMs.value),
);
const knockbackButtonLabel = computed(() => {
  if (currentActor.value === null) {
    return '防击退（1）';
  }

  return formatSkillCooldownLabel({
    label: '防击退',
    hotkey: '1',
    cooldown: currentActor.value.knockbackImmuneCooldown,
    currentTimeMs: renderSimulationTimeMs.value,
  });
});
const sprintButtonLabel = computed(() => {
  if (currentActor.value === null) {
    return '冲刺（2）';
  }

  return formatSkillCooldownLabel({
    label: '冲刺',
    hotkey: '2',
    cooldown: currentActor.value.sprintCooldown,
    currentTimeMs: renderSimulationTimeMs.value,
  });
});
const showBattleStartNotice = computed(
  () => props.battleStartNoticeUntilMs > 0 && hudNowMs.value < props.battleStartNoticeUntilMs,
);
const countdownBannerText = computed(() => {
  if (showBattleStartNotice.value) {
    return '战斗开始！';
  }

  if (props.serverCountdownSeconds === null) {
    return null;
  }

  return props.serverCountdownSeconds <= 0 ? '战斗开始！' : String(props.serverCountdownSeconds);
});
const isStartCountdownActive = computed(() => props.room?.startCountdown != null);
const supportsStartTime = computed(() => props.startTimeOptions !== null);
const startTimePresetOptions = computed<SelectOption[]>(() =>
  (props.startTimeOptions?.presets ?? []).map((preset) => ({
    label: preset.label,
    value: preset.timeMs,
  })),
);
const usesStartTimePresets = computed(() => startTimePresetOptions.value.length > 0);
const deadActorsInteractEnabled = computed(() => props.room?.options.deadActorsInteract ?? true);

function createStartBattlePayload(): StartBattlePayload {
  const startTimeMs =
    props.startTimeOptions === null ? 0 : Math.round((props.startTimeSeconds * 1_000) / 50) * 50;

  return {
    countdownMs: props.startCountdownSeconds * 1_000,
    ...(startTimeMs === 0 ? {} : { startTimeMs }),
  };
}

function emitStartBattle(): void {
  emit('startBattle', createStartBattlePayload());
}

function getBattleRoomOptionValue(option: BattleRoomOptionDefinition): boolean {
  return props.room?.mechanicOptions[option.key] ?? option.defaultValue;
}

function getSlotState(slot: PartySlot) {
  return slotMap.value.get(slot) ?? null;
}

function getHpPercent(slot: PartySlot): number {
  const actor = getActor(slot);
  const state = getSlotState(slot);
  if (state?.occupantType === 'empty' || !state) {
    return 0;
  }
  const current = actor?.currentHp ?? state?.currentHp ?? 0;
  const max = actor?.maxHp ?? 10000;
  if (max <= 0) return 0;
  return Math.min(Math.max((current / max) * 100, 0), 100);
}

function getHpBarColor(slot: PartySlot): string {
  const actor = getActor(slot);
  const state = getSlotState(slot);
  if (state?.occupantType === 'empty' || !state) {
    return 'rgba(255, 255, 255, 0.15)';
  }
  const current = actor?.currentHp ?? state?.currentHp ?? 0;
  if (current <= 0) {
    return '#4a4a4a';
  }
  const role = getSlotRole(slot);
  if (role === 'tank') {
    return '#3571d7';
  } else if (role === 'healer') {
    return '#2ca859';
  } else {
    return '#ca3c3c';
  }
}

function getOwnerTag(slot: PartySlot): {
  label: string;
  type: 'default';
} | null {
  const slotState = getSlotState(slot);

  if (slotState === null || slotState.occupantType !== 'player') {
    return null;
  }

  if (slotState.ownerUserId === props.room?.ownerUserId) {
    return {
      label: '房主',
      type: 'default',
    };
  }

  return null;
}

function getActor(slot: PartySlot) {
  return actorMap.value.get(slot) ?? null;
}

function createFallbackText(name: string): string {
  return Array.from(name.trim()).slice(0, 2).join('') || '??';
}

function formatStatusCountdown(expiresAt: number): string {
  if (!Number.isFinite(expiresAt)) {
    return '';
  }

  const remainingMs = expiresAt - renderSimulationTimeMs.value;

  if (remainingMs <= 0) {
    return '';
  }

  return `${Math.ceil(remainingMs / 1_000)}秒`;
}

function getStatusTitle(status: StatusViewModel): string {
  const lines = [status.name];

  if (status.countdownLabel !== '') {
    lines.push(`剩余：${status.countdownLabel}`);
  }

  if (status.description !== '') {
    lines.push(status.description);
  }

  return lines.join('\n');
}

function createStatusViewModels(statuses: BaseActorSnapshot['statuses']): StatusViewModel[] {
  return statuses
    .map((status, index) => {
      const remainingMs = status.expiresAt - renderSimulationTimeMs.value;

      if (Number.isFinite(status.expiresAt) && remainingMs <= 0) {
        return null;
      }

      const metadata = statusMetadataMap.value.get(status.id);
      const name = metadata?.name ?? status.name;
      const iconUrl = metadata?.iconUrl ?? null;
      const iconFailed = iconUrl !== null && failedStatusIconUrlSet.value.has(iconUrl);
      const viewModel: StatusViewModel = {
        key: status.id,
        name,
        description: metadata?.description ?? '',
        iconUrl,
        fallbackText: metadata?.fallbackText ?? createFallbackText(name),
        countdownLabel: formatStatusCountdown(status.expiresAt),
        title: '',
        iconFailed,
        partyListPriority: metadata?.partyListPriority ?? Number.MAX_SAFE_INTEGER,
        originalIndex: index,
      };
      viewModel.title = getStatusTitle(viewModel);

      return viewModel;
    })
    .filter((status): status is StatusViewModel => status !== null)
    .sort((left, right) => {
      if (left.partyListPriority !== right.partyListPriority) {
        return right.partyListPriority - left.partyListPriority;
      }

      return right.originalIndex - left.originalIndex;
    })
    .slice(0, 24);
}

function getMechanicStatusRows(slot: PartySlot): StatusViewModel[] {
  return createStatusViewModels(getActor(slot)?.statuses ?? []);
}

function handleStatusIconError(status: StatusViewModel): void {
  if (status.iconUrl === null) {
    return;
  }

  const nextFailedUrls = new Set(localFailedStatusIconUrls.value);
  nextFailedUrls.add(status.iconUrl);
  localFailedStatusIconUrls.value = nextFailedUrls;
  emit('statusIconLoadError', status.iconUrl);
}

function getSlotButtonLabel(slot: PartySlot): string {
  const slotState = getSlotState(slot);

  if (props.isSpectating) {
    return slotState?.occupantType === 'player' ? '已满' : '加入';
  }

  if (slot === props.currentPlayerSlot) {
    return '观战';
  }

  return '切换';
}

function getSlotButtonType(
  slot: PartySlot,
): 'default' | 'primary' | 'success' | 'warning' | 'info' {
  if (props.isSpectating) {
    return getSlotState(slot)?.occupantType === 'player' ? 'default' : 'primary';
  }

  if (slot === props.currentPlayerSlot) {
    return 'warning';
  }

  return 'info';
}

function isSlotButtonDisabled(slot: PartySlot): boolean {
  if (isStartCountdownActive.value) {
    return true;
  }

  if (props.snapshot?.phase !== 'waiting') {
    return true;
  }

  if (props.isSpectating) {
    return getSlotState(slot)?.occupantType === 'player';
  }

  return false;
}

function canKickSlot(slot: PartySlot): boolean {
  const slotState = getSlotState(slot);

  return (
    props.isOwner &&
    props.snapshot?.phase === 'waiting' &&
    !isStartCountdownActive.value &&
    slotState?.occupantType === 'player' &&
    slotState.ownerUserId !== null &&
    slotState.ownerUserId !== props.room?.ownerUserId
  );
}

function canKickSpectator(userId: string): boolean {
  return (
    props.isOwner &&
    props.snapshot?.phase === 'waiting' &&
    !isStartCountdownActive.value &&
    userId !== props.room?.ownerUserId
  );
}

function handleSlotAction(slot: PartySlot): void {
  if (slot === props.currentPlayerSlot) {
    emit('spectate');
    return;
  }

  emit('switchSlot', slot);
}

function handleKickSpectator(userId: string, name: string): void {
  if (!canKickSpectator(userId)) {
    return;
  }

  pendingKickAction.value = {
    targetUserId: userId,
    targetName: name,
  };
}

function cancelPendingKickAction(): void {
  pendingKickAction.value = null;
}

function confirmPendingKickAction(): void {
  const action = pendingKickAction.value;

  if (action === null) {
    return;
  }

  pendingKickAction.value = null;
  emit('kickMember', action.targetUserId);
}

function getResultTitle(result: EncounterResult | null): string {
  if (result === null) {
    return '尚无上一轮结果';
  }

  return result.outcome === 'success' ? '上一轮成功' : '上一轮失败';
}

function handleStartCountdownSecondsInput(value: number | null): void {
  if (value === null || Number.isNaN(value)) {
    return;
  }

  emit(
    'startCountdownSecondsChange',
    Math.min(Math.max(Math.round(value), MIN_START_COUNTDOWN_SECONDS), MAX_START_COUNTDOWN_SECONDS),
  );
}

function handleStartTimeSecondsInput(value: number | null): void {
  if (value === null || Number.isNaN(value) || props.startTimeOptions === null) {
    return;
  }

  const minSeconds = props.startTimeOptions.minMs / 1_000;
  const maxSeconds = props.startTimeOptions.maxMs / 1_000;

  emit('startTimeSecondsChange', Math.min(Math.max(value, minSeconds), maxSeconds));
}

function handleStartTimePresetChange(value: SelectValue): void {
  if (typeof value !== 'number' || props.startTimeOptions === null) {
    return;
  }

  emit('startTimeSecondsChange', value / 1_000);
}

function tickHudClock(): void {
  hudNowMs.value = performance.now();
}

watch(
  () => props.snapshot?.timeMs ?? 0,
  (timeMs) => {
    renderClockBase.value = {
      snapshotTimeMs: timeMs,
      clientNowMs: performance.now(),
    };
  },
  { immediate: true },
);

onMounted(() => {
  renderClockBase.value = {
    snapshotTimeMs: props.snapshot?.timeMs ?? 0,
    clientNowMs: performance.now(),
  };
  tickHudClock();
  hudTimer = window.setInterval(tickHudClock, HUD_TICK_MS);
});

onBeforeUnmount(() => {
  if (hudTimer !== null) {
    window.clearInterval(hudTimer);
    hudTimer = null;
  }
});
</script>

<template>
  <div class="battle-layout">
    <aside class="battle-sidebar">
      <div class="party-list-header">
        <div>
          <p class="eyebrow">小队</p>
          <h2 class="section-title">成员列表</h2>
        </div>
      </div>
      <div class="slot-list">
        <div
          v-for="slot in partyListOrder"
          :key="slot"
          class="slot-card"
          :class="{
            'is-self': slot === props.currentPlayerSlot,
            'is-empty': !getSlotState(slot) || getSlotState(slot)?.occupantType === 'empty',
            'is-bot': getSlotState(slot)?.occupantType === 'bot',
          }"
          :style="
            getSlotState(slot)?.occupantType === 'empty'
              ? {}
              : { background: getSlotCardBackground(slot) }
          "
        >
          <!-- 第一行：职业插槽、信息、控制 -->
          <div class="slot-main-row">
            <!-- 左侧：职业插槽标识 -->
            <div class="slot-badge-area">
              <div class="slot-role-badge" :class="getSlotRole(slot)">
                {{ slot }}
              </div>
            </div>

            <!-- 中部：姓名、HP数值和生命条 -->
            <div class="slot-info-area">
              <div class="slot-info-header">
                <span class="slot-name">
                  {{ getSlotState(slot)?.name ?? '等待加入' }}
                  <span v-if="slot === props.currentPlayerSlot" class="self-badge">我</span>
                  <span v-if="getOwnerTag(slot) !== null" class="owner-badge">房主</span>
                  <span v-if="getSlotState(slot)?.occupantType === 'bot'" class="bot-badge"
                    >Bot</span
                  >
                  <span
                    v-if="
                      getSlotState(slot)?.occupantType === 'player' && !getSlotState(slot)?.online
                    "
                    class="offline-badge"
                    >离线</span
                  >
                </span>
                <span
                  v-if="getSlotState(slot) && getSlotState(slot)?.occupantType !== 'empty'"
                  class="slot-hp-text"
                >
                  {{ getActor(slot)?.currentHp ?? getSlotState(slot)?.currentHp ?? 0 }}/{{
                    getActor(slot)?.maxHp ?? 10000
                  }}
                </span>
              </div>

              <!-- 生命条 -->
              <div class="slot-hp-bar-track">
                <div
                  class="slot-hp-bar-fill"
                  :style="{
                    width: getHpPercent(slot) + '%',
                    background: getHpBarColor(slot),
                  }"
                ></div>
              </div>
            </div>

            <!-- 控制操作区 -->
            <div class="slot-controls-area">
              <n-button
                v-if="props.isOwner && getSlotState(slot)?.occupantType !== 'player'"
                secondary
                strong
                size="tiny"
                class="slot-type-btn"
                @click.stop="
                  emit('setSlotOccupant', {
                    slot,
                    occupantType: getSlotState(slot)?.occupantType === 'bot' ? 'empty' : 'bot',
                  })
                "
              >
                {{ getSlotState(slot)?.occupantType === 'bot' ? '清空' : '托管' }}
              </n-button>
              <n-button
                secondary
                strong
                size="tiny"
                class="slot-action-btn"
                :type="getSlotButtonType(slot)"
                :disabled="isSlotButtonDisabled(slot)"
                @click.stop="handleSlotAction(slot)"
              >
                {{ getSlotButtonLabel(slot) }}
              </n-button>
              <button
                v-if="canKickSlot(slot)"
                class="slot-kick-btn"
                title="踢出房间"
                @click.stop="emit('kickMember', getSlotState(slot)!.ownerUserId!)"
              >
                ✕
              </button>
            </div>
          </div>

          <!-- 第二行：Buff/Debuff 状态图标列表 -->
          <div class="slot-status-area">
            <span
              v-for="status in getMechanicStatusRows(slot)"
              :key="status.key"
              class="status-icon-cell-compact"
              :title="status.title"
            >
              <img
                v-if="status.iconUrl !== null && !status.iconFailed"
                class="status-icon-compact"
                :src="status.iconUrl"
                :alt="status.name"
                draggable="false"
                @error="handleStatusIconError(status)"
              />
              <span v-else class="status-icon-fallback-compact">{{ status.fallbackText }}</span>
              <span v-if="status.countdownLabel" class="status-countdown-compact">{{
                status.countdownLabel.replace('秒', '')
              }}</span>
            </span>
          </div>
        </div>
      </div>

      <!-- 观战席区域 -->
      <div v-if="props.room" class="spectator-list-panel">
        <div class="spectator-list-header" @click="showSpectatorPanel = !showSpectatorPanel">
          <h2 class="section-title">
            观战席
            <span v-if="props.room.spectators.length" class="spectator-count"
              >({{ props.room.spectators.length }}人)</span
            >
          </h2>
          <span class="panel-toggle-icon" :class="{ 'is-collapsed': !showSpectatorPanel }"></span>
        </div>
        <div v-if="showSpectatorPanel" class="spectator-list-wrapper">
          <div v-if="props.room.spectators.length > 0" class="spectator-items">
            <span
              v-for="spectator in props.room.spectators"
              :key="spectator.userId"
              class="spectator-bubble-tag"
            >
              <span class="spectator-name-text">{{ spectator.name }}</span>
              <span v-if="spectator.userId === props.room.ownerUserId" class="owner-badge"
                >房主</span
              >
              <span v-if="!spectator.online" class="offline-badge">离线</span>
              <button
                v-if="canKickSpectator(spectator.userId)"
                class="spectator-kick-x"
                title="移出房间"
                @click.stop="handleKickSpectator(spectator.userId, spectator.name)"
              >
                ✕
              </button>
            </span>
          </div>
          <div v-else class="spectator-empty-text">暂无观战人员</div>
        </div>
      </div>

      <!-- 房间与机制设置区 -->
      <div v-if="props.room" class="room-settings-panel">
        <div class="room-settings-header" @click="showRoomSettingsPanel = !showRoomSettingsPanel">
          <h2 class="section-title">房间与机制</h2>
          <span
            class="panel-toggle-icon"
            :class="{ 'is-collapsed': !showRoomSettingsPanel }"
          ></span>
        </div>
        <div v-if="showRoomSettingsPanel" class="room-settings-body">
          <!-- 倒计时与跳时 -->
          <div class="setting-row">
            <span class="setting-label">起跑倒计时</span>
            <n-input-number
              size="tiny"
              class="setting-input-number"
              :min="MIN_START_COUNTDOWN_SECONDS"
              :max="MAX_START_COUNTDOWN_SECONDS"
              :step="1"
              :precision="0"
              :disabled="
                isStartCountdownActive || !props.isOwner || props.snapshot?.phase !== 'waiting'
              "
              :value="props.startCountdownSeconds"
              @update:value="handleStartCountdownSecondsInput"
            />
          </div>
          <div v-if="supportsStartTime" class="setting-row">
            <span class="setting-label">跳过/阶段时间</span>
            <n-select
              v-if="usesStartTimePresets"
              size="tiny"
              class="setting-select"
              :options="startTimePresetOptions"
              :disabled="
                isStartCountdownActive || !props.isOwner || props.snapshot?.phase !== 'waiting'
              "
              :value="Math.round(props.startTimeSeconds * 1_000)"
              @update:value="handleStartTimePresetChange"
            />
            <n-input-number
              v-else
              size="tiny"
              class="setting-input-number"
              :min="(props.startTimeOptions?.minMs ?? 0) / 1_000"
              :max="(props.startTimeOptions?.maxMs ?? 0) / 1_000"
              :step="START_TIME_STEP_SECONDS"
              :precision="2"
              :disabled="
                isStartCountdownActive || !props.isOwner || props.snapshot?.phase !== 'waiting'
              "
              :value="props.startTimeSeconds"
              @update:value="handleStartTimeSecondsInput"
            />
          </div>

          <!-- 核心开关：死亡后是否参与机制 -->
          <div class="setting-row">
            <div class="setting-label-block">
              <span class="setting-label">死亡参与机制</span>
              <span class="setting-desc">死亡后扮演尸体是否能继续触发机制判定</span>
            </div>
            <n-switch
              size="small"
              :value="deadActorsInteractEnabled"
              :disabled="
                isStartCountdownActive || !props.isOwner || props.snapshot?.phase !== 'waiting'
              "
              @update:value="
                emit('roomOptionsChange', {
                  options: {
                    deadActorsInteract: $event,
                  },
                })
              "
            />
          </div>

          <!-- 具体机制选项 -->
          <div
            v-for="option in props.battleRoomOptions"
            :key="option.key"
            class="setting-row mechanic-option-row"
          >
            <div class="setting-label-block">
              <span class="setting-label">{{ option.title }}</span>
              <span v-if="option.description" class="setting-desc">
                {{ option.description }}
              </span>
            </div>
            <n-switch
              size="small"
              :value="getBattleRoomOptionValue(option)"
              :disabled="
                isStartCountdownActive || !props.isOwner || props.snapshot?.phase !== 'waiting'
              "
              @update:value="
                emit('roomOptionsChange', {
                  mechanicOptions: {
                    [option.key]: $event,
                  },
                })
              "
            />
          </div>
        </div>
      </div>
    </aside>

    <main class="battle-main">
      <n-card embedded class="stage-card">
        <div class="stage-panel">
          <div class="stage-header">
            <div>
              <p class="eyebrow">场地</p>
              <h2 class="section-title">
                {{ props.snapshot?.battleName ?? props.room?.battleName ?? '未选择战斗' }}
              </h2>
            </div>

            <div class="stage-meta">
              <template v-if="props.isOwner">
                <div class="start-button-area">
                  <n-button
                    :type="props.snapshot?.phase === 'running' ? 'error' : 'primary'"
                    strong
                    class="start-battle-button"
                    :disabled="
                      props.snapshot?.phase === 'running'
                        ? false
                        : props.snapshot?.phase !== 'waiting' || !props.canStart
                    "
                    @click="
                      props.snapshot?.phase === 'running' ? emit('resetBattle') : emitStartBattle()
                    "
                  >
                    {{
                      props.snapshot?.phase === 'running'
                        ? '停止模拟'
                        : isStartCountdownActive
                          ? '开始倒计时中...'
                          : '开始模拟'
                    }}
                  </n-button>
                  <span
                    v-if="props.snapshot?.phase === 'waiting' && !props.canStart"
                    class="start-button-hint"
                  >
                    {{ hasEmptySlotHint ? '请先补满小队空位' : '请先选择战斗' }}
                  </span>
                </div>
              </template>
              <n-tag
                v-else
                :type="props.isSpectating ? 'info' : 'success'"
                size="medium"
                :bordered="false"
                class="spectator-status-tag"
              >
                {{ props.isSpectating ? '观战席' : '参战中' }}
              </n-tag>
              <n-select
                class="stage-mode-select"
                size="small"
                :value="props.operationMode"
                :options="props.operationModeOptions"
                @update:value="emit('operationModeChange', $event)"
              />
              <span class="stage-mode-hint">
                {{
                  props.operationMode === 'traditional'
                    ? '移动方向跟随镜头，移动时人物自动转向'
                    : props.operationMode === 'standard'
                      ? '右键拖拽同时转镜头和人物，移动方向跟随人物朝向'
                      : '地图固定不旋转，WASD 按地图方向移动'
                }}
              </span>
            </div>
          </div>

          <div class="stage-shell">
            <div
              v-if="
                props.isSpectating && props.snapshot?.phase === 'waiting' && !isStartCountdownActive
              "
              class="spectator-welcome-overlay"
            >
              <div class="welcome-card">
                <h3 class="welcome-title">观战中</h3>
                <p class="welcome-desc">点击小队中的【加入】或【切换】即可入场</p>
              </div>
            </div>
            <div v-if="props.isSpectating" class="spectate-overlay-hint">观战中</div>
            <div class="cast-overlay">
              <template
                v-for="castBar in castBars"
                :key="`${castBar.actionId}-${castBar.startedAt}`"
              >
                <div class="cast-name">{{ castBar.actionName }}</div>
                <div class="cast-track">
                  <div class="cast-fill" :style="getCastFillStyle(castBar)" />
                </div>
              </template>
            </div>

            <BattleStage
              :snapshot="props.snapshot"
              :controlled-actor-id="props.controlledActorId"
              :camera-yaw="props.cameraYaw"
              :camera-zoom="props.cameraZoom"
              :operation-mode="props.operationMode"
              :arena-background="props.arenaBackground"
              @camera-yaw-change="emit('cameraYawChange', $event)"
              @camera-zoom-change="emit('cameraZoomChange', $event)"
              @face-angle="emit('faceAngle', $event)"
            />

            <div v-if="!props.snapshot" class="empty-stage">等待战斗场景数据</div>
            <div v-if="countdownBannerText !== null" class="countdown-banner">
              <div class="countdown-banner-value">{{ countdownBannerText }}</div>
            </div>
            <div v-if="currentActorStatuses.length > 0" class="self-status-hud">
              <span
                v-for="status in currentActorStatuses"
                :key="status.key"
                class="status-icon-cell"
                :title="status.title"
              >
                <img
                  v-if="status.iconUrl !== null && !status.iconFailed"
                  class="status-icon"
                  :src="status.iconUrl"
                  :alt="status.name"
                  draggable="false"
                  @error="handleStatusIconError(status)"
                />
                <span v-else class="status-icon-fallback">{{ status.fallbackText }}</span>
                <span class="status-countdown">{{ status.countdownLabel }}</span>
              </span>
            </div>
          </div>

          <div class="stage-actions">
            <n-button
              secondary
              :disabled="!canUseKnockback"
              @click="emit('useKnockbackImmune', renderSimulationTimeMs)"
            >
              {{ knockbackButtonLabel }}
            </n-button>
            <n-button
              secondary
              :disabled="!canUseSprint"
              @click="emit('useSprint', renderSimulationTimeMs)"
            >
              {{ sprintButtonLabel }}
            </n-button>
            <n-button tertiary @click="emit('resetZoom')">重置视角</n-button>
          </div>
        </div>
      </n-card>
    </main>

    <aside class="result-sidebar">
      <n-card embedded class="result-card">
        <div class="result-panel">
          <div class="result-header">
            <p class="eyebrow">结果</p>
            <h2 class="section-title">{{ getResultTitle(props.latestResult) }}</h2>
          </div>

          <div class="result-stack">
            <div class="result-reasons">
              <div class="panel-title">失败原因</div>
              <div class="panel-body">
                <div class="panel-scroll">
                  <template v-if="props.latestResult !== null">
                    <div v-if="props.latestResult.failureReasons.length > 0" class="reason-list">
                      <div
                        v-for="reason in props.latestResult.failureReasons"
                        :key="reason"
                        class="reason-item"
                      >
                        {{ reason }}
                      </div>
                    </div>
                    <n-empty v-else description="没有失败原因，本轮为成功。" />
                  </template>
                  <n-empty v-else description="开始一轮模拟后，这里会展示上一轮结果。" />
                </div>
              </div>
            </div>

            <div class="log-panel">
              <div class="panel-title">实时日志</div>
              <div class="panel-body">
                <div class="panel-scroll">
                  <div v-if="props.logs.length > 0" class="log-list">
                    <div
                      v-for="(line, index) in props.logs"
                      :key="`${index}-${line}`"
                      class="log-item"
                    >
                      {{ line }}
                    </div>
                  </div>
                  <n-empty v-else description="当前没有日志。" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </n-card>
    </aside>
  </div>

  <n-modal
    :show="pendingKickAction !== null"
    :mask-closable="false"
    @update:show="(show) => !show && cancelPendingKickAction()"
  >
    <div class="slot-confirm-modal">
      <h3 class="slot-confirm-title">确认移出成员</h3>
      <p class="slot-confirm-description">
        确认将 {{ pendingKickAction?.targetName }} 移出房间吗？
      </p>
      <div class="slot-confirm-actions">
        <n-button tertiary @click="cancelPendingKickAction">取消</n-button>
        <n-button type="error" @click="confirmPendingKickAction">确认移出</n-button>
      </div>
    </div>
  </n-modal>
</template>

<style scoped>
.battle-layout {
  display: grid;
  grid-template-columns: minmax(408px, 440px) minmax(0, 1fr) 320px;
  gap: 14px;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.battle-sidebar,
.result-sidebar,
.battle-main {
  min-height: 0;
  overflow: hidden;
}

.battle-sidebar,
.result-sidebar {
  display: flex;
  flex-direction: column;
}

.result-card,
.stage-card {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}

.battle-sidebar {
  min-height: 0;
  gap: 10px;
}

.party-list-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.slot-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}

/* 整个卡片容器 */
.slot-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 6px 10px 8px 10px;
  border-left: 3px solid transparent;
  border-radius: 4px;
  position: relative;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.03);
  transition: background 0.15s ease;
}

/* 第一行容器 */
.slot-main-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.slot-card:hover {
  background: rgba(255, 255, 255, 0.06);
}

/* 自己（本人）的高亮样式 */
.slot-card.is-self {
  border-left-color: rgba(226, 164, 112, 0.7);
  background: rgba(226, 164, 112, 0.06);
}

/* 空插槽的虚线样式 */
.slot-card.is-empty {
  background: transparent;
  opacity: 0.5;
}

.slot-card.is-empty:hover {
  background: rgba(255, 255, 255, 0.03);
  opacity: 0.7;
}

/* 左侧职业角色角标 */
.slot-badge-area {
  flex: 0 0 auto;
}

.slot-role-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 18px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 700;
  color: #ffffff;
}

.slot-role-badge.tank {
  background: rgba(77, 141, 255, 0.55);
}

.slot-role-badge.healer {
  background: rgba(63, 191, 114, 0.55);
}

.slot-role-badge.dps {
  background: rgba(213, 76, 76, 0.55);
}

/* 中部名字与生命值 */
.slot-info-area {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 3px;
}

.slot-info-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  line-height: 1;
}

.slot-name {
  font-size: 13px;
  font-weight: 700;
  color: rgba(246, 239, 228, 0.95);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 4px;
}

.self-badge {
  font-size: 9px;
  background: rgba(226, 164, 112, 0.16);
  border: 1px solid rgba(226, 164, 112, 0.4);
  color: #e2a470;
  padding: 0 3px;
  border-radius: 2px;
  font-weight: 800;
  transform: scale(0.9);
  transform-origin: left center;
}

.owner-badge {
  font-size: 9px;
  background: rgba(77, 141, 255, 0.16);
  border: 1px solid rgba(77, 141, 255, 0.4);
  color: #4d8dff;
  padding: 0 3px;
  border-radius: 2px;
  font-weight: 800;
  transform: scale(0.9);
  transform-origin: left center;
}

.slot-hp-text {
  font-size: 10px;
  font-family: monospace;
  color: rgba(246, 239, 228, 0.65);
  flex-shrink: 0;
}

/* HP 进度条轨道 */
.slot-hp-bar-track {
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 2px;
  overflow: hidden;
}

.slot-hp-bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s cubic-bezier(0.1, 0.8, 0.1, 1);
}

/* 第二行状态图标区 */
.slot-status-area {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px;
  min-width: 0;
  min-height: 28px;
}

.status-icon-cell-compact {
  position: relative;
  display: inline-block;
  width: 26px;
  height: 26px;
  flex-shrink: 0;
}

.status-icon-compact {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 2px;
  background: rgba(0, 0, 0, 0.3);
  box-sizing: border-box;
}

.slot-kick-btn {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #f87171;
  border-radius: 4px;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 11px;
  margin-left: 6px;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.slot-kick-btn:hover {
  background: rgba(239, 68, 68, 0.3);
  border-color: #ef4444;
  color: #ffffff;
  box-shadow: 0 0 8px rgba(239, 68, 68, 0.4);
}

.status-icon-fallback-compact {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 9px;
  font-weight: bold;
  background: rgba(0, 0, 0, 0.6);
  color: rgba(246, 239, 228, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 2px;
  box-sizing: border-box;
}

.status-countdown-compact {
  position: absolute;
  bottom: -11px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  font-weight: 800;
  color: #ffffff;
  text-shadow:
    1px 1px 0 #000,
    -1px -1px 0 #000,
    1px -1px 0 #000,
    -1px 1px 0 #000;
  line-height: 1;
  pointer-events: none;
  white-space: nowrap;
}

/* 右侧控制操作区 */
.slot-controls-area {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6px;
}

.slot-action-btn {
  font-weight: 800 !important;
  font-size: 11px !important;
  min-width: 44px;
  height: 22px !important;
  padding: 0 6px !important;
}

.bot-badge {
  font-size: 9px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.25);
  color: rgba(246, 239, 228, 0.65);
  padding: 0 3px;
  border-radius: 2px;
  font-weight: 800;
  transform: scale(0.9);
  transform-origin: left center;
}

.offline-badge {
  font-size: 9px;
  background: rgba(213, 76, 76, 0.16);
  border: 1px solid rgba(213, 76, 76, 0.4);
  color: #d54c4c;
  padding: 0 3px;
  border-radius: 2px;
  font-weight: 800;
  transform: scale(0.9);
  transform-origin: left center;
}

.start-battle-button {
  font-weight: 800 !important;
  box-shadow: 0 4px 12px rgba(201, 139, 90, 0.2);
}

.start-button-area {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.start-button-hint {
  font-size: 11px;
  color: rgba(246, 239, 228, 0.5);
  padding-left: 2px;
}

.spectator-status-tag {
  font-weight: 800;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}

/* 观战席面板样式 */
.spectator-list-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: rgba(20, 18, 16, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  padding: 10px 12px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.spectator-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  user-select: none;
}

.spectator-list-header .section-title {
  margin: 0;
}

.panel-toggle-icon {
  display: inline-block;
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 6px solid rgba(246, 239, 228, 0.5);
  flex-shrink: 0;
  margin-left: 8px;
  transition:
    transform 0.2s ease,
    border-top-color 0.15s ease;
}

.panel-toggle-icon.is-collapsed {
  transform: rotate(-90deg);
}

.spectator-list-header:hover .panel-toggle-icon,
.room-settings-header:hover .panel-toggle-icon {
  border-top-color: rgba(246, 239, 228, 0.85);
}

.spectator-count {
  font-size: 11px;
  font-weight: normal;
  color: rgba(246, 239, 228, 0.45);
  margin-left: 4px;
}

.spectator-list-wrapper {
  min-height: 0;
}

.spectator-items {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* 观战人员的药丸标签 */
.spectator-bubble-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 2px 8px;
  font-size: 12px;
  color: rgba(246, 239, 228, 0.82);
  line-height: 1.2;
}

.spectator-bubble-tag:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.18);
}

.spectator-name-text {
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 观战剔除 X 按钮 */
.spectator-kick-x {
  background: transparent;
  border: none;
  color: rgba(213, 76, 76, 0.6);
  cursor: pointer;
  padding: 0;
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  transition: color 0.15s ease;
}

.spectator-kick-x:hover {
  color: #d54c4c;
}

.spectator-empty-text {
  font-size: 11px;
  color: rgba(246, 239, 228, 0.35);
  text-align: center;
  padding: 6px 0;
}

/* 房间机制与设置面板 */
.room-settings-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: rgba(20, 18, 16, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  padding: 12px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.room-settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  padding-bottom: 6px;
  cursor: pointer;
  user-select: none;
}

.room-settings-header .section-title {
  margin: 0;
}

.room-settings-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 扁平网格设置行 */
.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  min-height: 24px;
}

.setting-label {
  color: rgba(246, 239, 228, 0.75);
  font-weight: 500;
}

.setting-label-block {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.setting-desc {
  font-size: 10px;
  color: rgba(246, 239, 228, 0.4);
  line-height: 1.2;
}

.setting-input-number {
  width: 90px;
}

.setting-select {
  width: 130px;
}

.battle-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.stage-card :deep(.n-card-content) {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  padding-top: 12px;
  padding-bottom: 12px;
}

.stage-panel {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  flex: 1 1 auto;
  gap: 8px;
  min-width: 0;
  min-height: 0;
}

.stage-shell {
  position: relative;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.self-status-hud {
  position: absolute;
  left: 14px;
  bottom: 14px;
  z-index: 4;
  display: grid;
  grid-template-columns: repeat(auto-fill, 32px);
  grid-auto-rows: 48px;
  justify-content: start;
  gap: 4px 5px;
  width: min(272px, calc(100% - 28px));
  pointer-events: none;
}

.status-icon-cell {
  position: relative;
  display: block;
  width: 32px;
  height: 48px;
}

.status-icon {
  display: block;
  width: 32px;
  height: 32px;
  object-fit: contain;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.3);
  box-sizing: border-box;
}

.status-countdown {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  font-weight: 800;
  color: #ffffff;
  text-shadow:
    1px 1px 0 #000,
    -1px -1px 0 #000,
    1px -1px 0 #000,
    -1px 1px 0 #000;
  line-height: 1;
  pointer-events: none;
  white-space: nowrap;
}

.status-icon-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  font-size: 10px;
  font-weight: bold;
  background: rgba(0, 0, 0, 0.6);
  color: rgba(246, 239, 228, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 3px;
  box-sizing: border-box;
}

.countdown-banner {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: grid;
  place-items: center;
  pointer-events: none;
  background: radial-gradient(
    circle at center,
    rgba(0, 0, 0, 0.2),
    rgba(0, 0, 0, 0.04) 44%,
    transparent 68%
  );
}

.countdown-banner-value {
  color: #fff7e8;
  font-size: 76px;
  font-weight: 800;
  line-height: 1;
  text-shadow:
    0 4px 18px rgba(0, 0, 0, 0.62),
    0 0 32px rgba(240, 208, 139, 0.46);
}

.stage-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-height: 40px;
}

.stage-mode-hint {
  font-size: 10px;
  color: rgba(246, 239, 228, 0.4);
  max-width: 260px;
  line-height: 1.3;
  margin-left: 2px;
}

.result-card :deep(.n-card-content) {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  padding-top: 12px;
  padding-bottom: 12px;
}

.result-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
}

.result-header {
  min-height: 0;
}

.result-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1 1 auto;
  min-height: 0;
}

.result-reasons,
.log-panel {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  overflow: hidden;
}

.panel-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.reason-list,
.log-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.reason-item {
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  padding: 10px 12px;
}

.panel-title {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: rgba(246, 239, 228, 0.68);
}

.panel-scroll {
  height: 100%;
  min-height: 0;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(201, 139, 90, 0.7) rgba(255, 255, 255, 0.05);
}

.panel-scroll::-webkit-scrollbar {
  width: 10px;
}

.panel-scroll::-webkit-scrollbar-track {
  margin: 6px 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
}

.panel-scroll::-webkit-scrollbar-thumb {
  border: 2px solid transparent;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(240, 208, 139, 0.88) 0%, rgba(201, 139, 90, 0.82) 100%)
    padding-box;
  box-shadow: inset 0 0 0 1px rgba(255, 244, 220, 0.12);
}

.panel-scroll::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(180deg, rgba(244, 218, 153, 0.96) 0%, rgba(214, 118, 82, 0.9) 100%)
    padding-box;
}

.stage-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  flex-wrap: wrap;
}

.stage-header > div:first-child {
  min-width: 0;
}

.stage-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  min-width: 0;
  justify-content: flex-end;
}

.countdown-input {
  width: 86px;
}

.start-time-input {
  width: 132px;
}

.eyebrow {
  margin: 0 0 4px;
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(246, 239, 228, 0.55);
}

.section-title {
  margin: 0;
  overflow: hidden;
  font-size: 18px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stage-mode-select {
  width: 112px;
}

.spectate-button {
  min-width: 72px;
  font-weight: 700;
}

.cast-overlay {
  position: absolute;
  top: 16px;
  left: 50%;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: min(420px, calc(100% - 80px));
  transform: translateX(-50%);
  pointer-events: none;
}

.cast-name {
  margin-bottom: 2px;
  text-align: center;
  font-size: 14px;
  font-weight: 700;
  color: #f6efe4;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.55);
}

.cast-track {
  height: 12px;
  border-radius: 999px;
  border: 1px solid rgba(255, 239, 194, 0.24);
  background: rgba(0, 0, 0, 0.34);
  overflow: hidden;
}

.cast-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #f0d08b 0%, #d67652 100%);
  transform-origin: left center;
  transform: scaleX(0);
}

.empty-stage {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  pointer-events: none;
  color: rgba(246, 239, 228, 0.72);
}

.log-list {
  font-size: 12px;
  line-height: 1.5;
  color: rgba(246, 239, 228, 0.76);
}

.log-item {
  padding: 0;
  border: 0;
  background: transparent;
  white-space: pre-wrap;
  word-break: break-word;
}

.slot-confirm-modal {
  width: min(360px, calc(100vw - 32px));
  border: 1px solid rgba(255, 223, 177, 0.14);
  border-radius: 8px;
  padding: 18px;
  color: #f6efe4;
  background: rgba(24, 18, 16, 0.96);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
}

.slot-confirm-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}

.slot-confirm-description {
  margin: 10px 0 0;
  color: rgba(246, 239, 228, 0.78);
  line-height: 1.5;
}

.slot-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
}

/* 观战提示遮罩 */
.spectate-overlay-hint {
  position: absolute;
  top: 12px;
  left: 12px;
  background: rgba(10, 21, 23, 0.75);
  border-radius: 4px;
  padding: 3px 10px;
  z-index: 10;
  pointer-events: none;
  font-size: 11px;
  font-weight: 600;
  color: rgba(246, 239, 228, 0.7);
}

/* 观战提示中央大卡片与遮罩 */
.spectator-welcome-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  animation: spectator-fade-in 0.25s ease-out;
}

.welcome-card {
  width: 90%;
  max-width: 300px;
  background: rgba(24, 22, 20, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 20px 24px;
  text-align: center;
  box-shadow:
    0 20px 40px rgba(0, 0, 0, 0.6),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  animation: spectator-slide-up 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.welcome-title {
  margin: 0 0 8px 0;
  font-size: 16px;
  font-weight: 700;
  color: #f6efe4;
}

.welcome-desc {
  margin: 0;
  font-size: 13px;
  color: rgba(246, 239, 228, 0.7);
  line-height: 1.6;
}

/* Bot卡片去色调暗 */
.slot-card.is-bot {
  opacity: 0.65;
}

/* 房主 托管/清空切换按钮 */
.slot-type-btn {
  font-weight: 800 !important;
  font-size: 10px !important;
  height: 20px !important;
  padding: 0 4px !important;
  opacity: 0.8;
}

.slot-type-btn:hover {
  opacity: 1;
}

@keyframes spectator-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes spectator-slide-up {
  from {
    transform: translateY(10px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
</style>
