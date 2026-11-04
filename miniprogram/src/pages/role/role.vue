<template>
  <view class="role-page">
    <view class="role-title">调整身份</view>
    <view class="role-subtitle">
      输入对应验证码后，当前微信会切换角色，历史记录和成员身份不会丢失。
    </view>

    <view class="role-card">
      <view class="role-line">
        <text class="role-label">当前身份</text>
        <text class="role-value">{{ currentLabel }}</text>
      </view>
      <view class="role-line">
        <text class="role-label">切换为</text>
        <text class="role-value target">{{ targetLabel }}</text>
      </view>
    </view>

    <input
      v-model="inviteCode"
      class="input"
      password
      :placeholder="targetKind === 'chef' ? '输入主厨验证码' : '输入家人验证码'"
    />
    <view class="tip">
      主厨验证码会授予主厨权限；如果这是最后一名主厨，不能切换为家人。
    </view>
    <button class="primary" :loading="loading" @tap="submit">确认切换</button>
  </view>
</template>

<script>
import { changeRole, getMember } from '../../utils/auth.js';
import { toast } from '../../utils/index.js';

export default {
  data() {
    return {
      member: null,
      targetKind: 'chef',
      inviteCode: '',
      loading: false,
    };
  },
  computed: {
    currentLabel() {
      return this.member && this.member.role === 'chef' ? '主厨' : '家人';
    },
    targetLabel() {
      return this.targetKind === 'chef' ? '主厨' : '家人';
    },
  },
  onShow() {
    this.member = getMember();
    this.targetKind = this.member && this.member.role === 'chef' ? 'family' : 'chef';
  },
  methods: {
    async submit() {
      if (!this.inviteCode) return toast('请先输入验证码');
      this.loading = true;
      try {
        const updated = await changeRole({
          kind: this.targetKind,
          inviteCode: this.inviteCode,
        });
        toast(updated.role === 'chef' ? '已升级为主厨' : '已切换为家人');
        uni.switchTab({ url: '/pages/today/today' });
      } catch (error) {
        toast(error.message);
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style>
.role-page { padding: 48rpx 36rpx; }
.role-title { font-size: 52rpx; font-weight: 700; }
.role-subtitle { margin-top: 16rpx; color: #8A8077; font-size: 26rpx; line-height: 1.6; }
.role-card {
  margin: 40rpx 0 30rpx;
  padding: 10rpx 28rpx;
  background: #FFFFFF;
  border-radius: 20rpx;
}
.role-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 22rpx 0;
  border-bottom: 1rpx solid #EFE7DC;
}
.role-line:last-child { border-bottom: 0; }
.role-label { color: #8A8077; font-size: 26rpx; }
.role-value { color: #3B342E; font-size: 28rpx; font-weight: 600; }
.role-value.target { color: #D96A3B; }
.input { display: block; width: 100%; padding: 26rpx 28rpx; border-radius: 18rpx; background: #FFFFFF; }
.tip { color: #8A8077; font-size: 24rpx; line-height: 1.6; margin: 16rpx 0 30rpx; }
.primary { width: 100%; background: #5B8C5A; color: #FFFFFF; border-radius: 20rpx; }
</style>
