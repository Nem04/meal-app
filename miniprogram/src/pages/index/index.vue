<template>
  <view class="entry-page">
    <image class="logo" src="/static/brand/app-avatar-144.png" mode="aspectFill"></image>
    <view class="title">家庭点菜</view>
    <view class="status">{{ statusText }}</view>
    <button v-if="failed" class="retry" @tap="start">重新验证微信身份</button>
  </view>
</template>

<script>
import { bootstrapAuth } from '../../utils/auth.js';

export default {
  data() {
    return {
      statusText: '正在验证微信身份…',
      failed: false,
    }
  },
  onLoad() {
    this.start();
  },
  methods: {
    async start() {
      this.failed = false;
      this.statusText = '正在验证微信身份…';
      try {
        await bootstrapAuth();
        uni.switchTab({ url: '/pages/today/today' });
      } catch (error) {
        if (error.code === 'BIND_REQUIRED') return;
        this.failed = true;
        this.statusText = error.message || '微信登录失败，请检查网络后重试';
      }
    },
  },
}
</script>

<style>
.entry-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0 48rpx;
  box-sizing: border-box;
  background: linear-gradient(180deg, #FBF7F0 0%, #F1E7D8 100%);
}

.logo {
  width: 240rpx;
  height: 240rpx;
  border-radius: 52rpx;
  box-shadow: 0 20rpx 44rpx rgba(65, 92, 62, 0.18);
}

.title {
  margin-top: 42rpx;
  color: #3B342E;
  font-size: 48rpx;
  font-weight: 700;
  letter-spacing: 4rpx;
}

.status {
  margin-top: 18rpx;
  color: #7D746B;
  font-size: 26rpx;
  text-align: center;
}

.retry {
  margin-top: 36rpx;
  padding: 0 36rpx;
  border: none;
  border-radius: 999rpx;
  background: #5B8C5A;
  color: #FFFFFF;
  font-size: 28rpx;
  line-height: 82rpx;
}
</style>
