<script setup lang="ts">
import type { SelectOption } from 'naive-ui';
import { NButton, NEmpty, NInput, NSelect, NTag, NText } from 'naive-ui';
import type { RoomSummaryDto } from '@ff14arena/shared';
import { getRoomPhaseLabel, getRoomPhaseTagType } from '../../utils/ui';

const props = defineProps<{
  createRoomName: string;
  createBattleId: string | null;
  battleOptions: SelectOption[];
  rooms: RoomSummaryDto[];
}>();

const emit = defineEmits<{
  createRoomNameChange: [value: string];
  createBattleIdChange: [value: string | null];
  createRoom: [];
  refreshLobby: [];
  joinRoom: [roomId: string];
  joinSpectator: [roomId: string];
}>();
</script>

<template>
  <div class="lobby-layout">
    <!-- 创建房间区 -->
    <div class="create-section">
      <div class="section-title">
        <span class="section-icon">⚔</span>
        <span>创建房间</span>
      </div>
      <div class="create-form">
        <n-input
          :value="props.createRoomName"
          maxlength="32"
          placeholder="房间名（例如：练习房）"
          class="create-input"
          @update:value="emit('createRoomNameChange', $event)"
        />
        <n-select
          :value="props.createBattleId"
          :options="props.battleOptions"
          placeholder="选择战斗机制"
          class="create-select"
          @update:value="emit('createBattleIdChange', typeof $event === 'string' ? $event : null)"
        />
        <n-button type="primary" class="create-btn" @click="emit('createRoom')">
          创建并进入
        </n-button>
      </div>
    </div>

    <!-- 分隔线 -->
    <div class="divider" />

    <!-- 房间列表区 -->
    <div class="rooms-section">
      <div class="section-title">
        <span class="section-icon">🏟</span>
        <span>当前大厅</span>
        <n-button secondary size="tiny" class="refresh-btn" @click="emit('refreshLobby')">
          刷新
        </n-button>
      </div>

      <div v-if="props.rooms.length > 0" class="rooms-list">
        <div v-for="roomItem in props.rooms" :key="roomItem.roomId" class="room-card">
          <div class="room-info">
            <div class="room-name-row">
              <strong class="room-name">{{ roomItem.name }}</strong>
              <n-tag :type="getRoomPhaseTagType(roomItem.phase)" size="small" round>
                {{ getRoomPhaseLabel(roomItem.phase) }}
              </n-tag>
            </div>
            <div class="room-meta">
              <n-text depth="2" class="room-battle">{{
                roomItem.battleName ?? '未选择战斗'
              }}</n-text>
              <n-text depth="3" class="room-count">{{ roomItem.occupantCount }} 人</n-text>
            </div>
          </div>
          <div class="room-actions">
            <n-button type="primary" size="small" @click="emit('joinRoom', roomItem.roomId)">
              加入
            </n-button>
            <n-button
              secondary
              type="info"
              size="small"
              @click="emit('joinSpectator', roomItem.roomId)"
            >
              观战
            </n-button>
          </div>
        </div>
      </div>

      <div v-else class="rooms-empty">
        <n-empty description="当前没有房间，在上方创建一个吧。" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.lobby-layout {
  display: flex;
  flex-direction: column;
  gap: 0;
  width: 100%;
  max-width: 780px;
  margin: 0 auto;
  padding: 24px 16px 16px;
  box-sizing: border-box;
}
/* ---- 标题行 ---- */
.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: rgba(246, 239, 228, 0.88);
  margin-bottom: 14px;
}

.section-icon {
  font-size: 16px;
  line-height: 1;
}

/* ---- 创建房间区 ---- */
.create-section {
  background: rgba(201, 139, 90, 0.06);
  border: 1px solid rgba(201, 139, 90, 0.22);
  border-radius: 14px;
  padding: 20px 22px;
}

.create-form {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.create-input {
  flex: 1 1 180px;
  min-width: 140px;
}

.create-select {
  flex: 1 1 200px;
  min-width: 160px;
}

.create-btn {
  flex: 0 0 auto;
  white-space: nowrap;
}

/* ---- 分隔线 ---- */
.divider {
  height: 1px;
  background: rgba(255, 223, 177, 0.08);
  margin: 22px 0;
}

/* ---- 房间列表区 ---- */
.rooms-section {
  display: flex;
  flex-direction: column;
}

.refresh-btn {
  margin-left: auto;
}

.rooms-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.room-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 18px;
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid rgba(255, 223, 177, 0.08);
  border-radius: 10px;
  transition:
    background 0.2s,
    border-color 0.2s;
}

.room-card:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(201, 139, 90, 0.2);
}

.room-info {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.room-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.room-name {
  font-size: 15px;
  color: #f6efe4;
}

.room-meta {
  display: flex;
  align-items: center;
  gap: 12px;
}

.room-battle {
  font-size: 12px;
}

.room-count {
  font-size: 12px;
}

.room-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.rooms-empty {
  padding: 32px 0;
}
</style>
