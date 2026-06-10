<script setup lang="ts">
import type { SelectOption } from 'naive-ui';
import { ref, watch } from 'vue';
import { NButton, NIcon, NInput, NLayoutHeader, NSelect, NTag, NTooltip } from 'naive-ui';
import type { SelectValue } from '../../utils/ui';

const githubUrl = 'https://github.com/etnAtker/ff14arena_next';

const props = defineProps<{
  connected: boolean;
  latencyDisplay: string;
  userName: string;
  roomName: string | null;
  roomPhase: string | null;
  battleName: string | null;
  isOwner: boolean;
  battleOptions: SelectOption[];
  roomBattleId: string | null;
  battleSelectDisabled: boolean;
}>();

const emit = defineEmits<{
  selectBattle: [value: SelectValue];
  leaveRoom: [];
  openMetrics: [];
  editUserName: [name: string];

}>();

// 内联昵称输入框本地状态
const localUserName = ref(props.userName);

// 当外部 prop 变化时同步（例如首次连接时设置）
watch(
  () => props.userName,
  (val) => {
    localUserName.value = val;
  },
);

function commitUserName(): void {
  const trimmed = localUserName.value.trim();
  if (trimmed && trimmed !== props.userName) {
    emit('editUserName', trimmed);
  } else if (!trimmed) {
    // 不允许清空，还原
    localUserName.value = props.userName;
  }
}
</script>

<template>
  <n-layout-header class="shell-header">
    <div class="topbar">
      <!-- 左侧：品牌 + 房间信息 -->
      <div class="topbar-left">
        <div class="brand-block">
          <p class="eyebrow">FF14 Arena</p>
          <h1 class="page-title">联机机制模拟</h1>
        </div>

        <div v-if="props.roomName" class="room-block">
          <div class="room-separator" />
          <div class="room-info">
            <strong class="room-name">{{ props.roomName }}</strong>
            <n-tag
              v-if="props.roomPhase"
              :type="props.roomPhase === '模拟中' ? 'success' : 'info'"
              size="small"
              round
            >
              {{ props.roomPhase }}
            </n-tag>
            <span v-if="!props.isOwner" class="battle-name-label">{{
              props.battleName ?? '未选择战斗'
            }}</span>
            <n-select
              v-if="props.isOwner"
              class="battle-select"
              :value="props.roomBattleId"
              :options="props.battleOptions"
              :disabled="props.battleSelectDisabled"
              placeholder="选择机制"
              @update:value="emit('selectBattle', $event)"
            />
          </div>
        </div>
      </div>

      <!-- 右侧：状态指示 + 操作按钮 -->
      <div class="topbar-right">
        <!-- 连接状态 + 延迟 -->
        <div :class="['conn-indicator', props.connected ? 'conn-ok' : 'conn-err']">
          <span class="conn-dot" />
          <span class="conn-label">{{ props.connected ? props.latencyDisplay : '断开' }}</span>
        </div>

        <!-- 内联昵称输入框 -->
        <div class="username-field">
          <span class="username-label">昵称</span>
          <n-input
            v-model:value="localUserName"
            placeholder="输入昵称"
            maxlength="24"
            size="small"
            class="username-input"
            @blur="commitUserName"
            @keyup.enter="commitUserName"
          />
        </div>

        <!-- 功能按钮组 -->
        <div class="action-group">
          <n-button
            v-if="props.roomName"
            type="error"
            secondary
            size="small"
            @click="emit('leaveRoom')"
          >
            离开
          </n-button>


          <!-- 观测 -->
          <n-tooltip placement="bottom" trigger="hover">
            <template #trigger>
              <n-button
                secondary
                circle
                size="small"
                aria-label="服务器观测"
                @click="emit('openMetrics')"
              >
                <template #icon>
                  <n-icon>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        fill="currentColor"
                        d="M3 13h2v8H3zm4-4h2v12H7zm4-6h2v18h-2zm4 8h2v10h-2zm4-4h2v14h-2z"
                      />
                    </svg>
                  </n-icon>
                </template>
              </n-button>
            </template>
            服务器观测
          </n-tooltip>

          <!-- GitHub -->
          <n-button
            tag="a"
            :href="githubUrl"
            target="_blank"
            rel="noopener noreferrer"
            secondary
            circle
            size="small"
            title="GitHub"
            aria-label="打开 GitHub 仓库"
          >
            <template #icon>
              <n-icon>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M12 2C6.48 2 2 6.59 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.09.68-.22.68-.49 0-.24-.01-.88-.01-1.73-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.55-1.14-4.55-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.32 9.32 0 0 1 12 7c.85 0 1.71.12 2.51.34 1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.8-4.56 5.05.36.32.68.95.68 1.91 0 1.38-.01 2.49-.01 2.83 0 .27.18.59.69.49A10.17 10.17 0 0 0 22 12.25C22 6.59 17.52 2 12 2Z"
                  />
                </svg>
              </n-icon>
            </template>
          </n-button>
        </div>
      </div>
    </div>
  </n-layout-header>
</template>

<style scoped>
.shell-header {
  padding: 10px 20px 8px;
  border-bottom: 1px solid rgba(255, 223, 177, 0.06);
  background: rgba(13, 13, 16, 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 42px;
}

/* ---- 左侧 ---- */
.topbar-left {
  display: flex;
  align-items: center;
  gap: 0;
  min-width: 0;
  flex: 1;
}

.brand-block {
  flex-shrink: 0;
}

.eyebrow {
  margin: 0 0 1px;
  font-size: 9px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(246, 239, 228, 0.42);
}

.page-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: rgba(246, 239, 228, 0.92);
  white-space: nowrap;
}

.room-separator {
  width: 1px;
  height: 28px;
  background: rgba(255, 223, 177, 0.12);
  margin: 0 16px;
  flex-shrink: 0;
}

.room-block {
  display: flex;
  align-items: center;
  min-width: 0;
  flex: 1;
}

.room-info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-wrap: nowrap;
  overflow: hidden;
}

.room-name {
  font-size: 14px;
  white-space: nowrap;
  color: #f6efe4;
}

.battle-name-label {
  font-size: 12px;
  color: rgba(246, 239, 228, 0.55);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.battle-select {
  width: 200px;
  flex: 0 0 200px;
}

/* ---- 右侧 ---- */
.topbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

/* 连接状态指示器 */
.conn-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 99px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  border: 1px solid;
}

.conn-ok {
  color: #7bc79b;
  border-color: rgba(123, 199, 155, 0.25);
  background: rgba(123, 199, 155, 0.07);
}

.conn-err {
  color: #e48686;
  border-color: rgba(228, 134, 134, 0.25);
  background: rgba(228, 134, 134, 0.07);
}

.conn-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}

.conn-ok .conn-dot {
  box-shadow: 0 0 6px currentColor;
  animation: blink 2.5s ease-in-out infinite;
}

@keyframes blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

/* 内联昵称输入框 */
.username-field {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.username-label {
  font-size: 11px;
  color: rgba(246, 239, 228, 0.45);
  white-space: nowrap;
  flex-shrink: 0;
}

.username-input {
  width: 120px;
}

/* 按钮组 */
.action-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

@media (max-width: 600px) {
  .shell-header {
    padding: 8px 14px;
  }
  .battle-select {
    width: 140px;
    flex: 0 0 140px;
  }
  .username-input {
    width: 90px;
  }
}
</style>
