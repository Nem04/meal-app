<template>
  <view class="switch-page">
    <view class="back-row">
      <view class="back-button" @tap="goBack">
        <text class="back-arrow">‹</text>
        <text>返回</text>
      </view>
    </view>
    <image class="logo" src="/static/brand/app-avatar-144.png" mode="aspectFill"></image>
    <view class="title">已退出登录</view>
    <view class="subtitle">
      小程序登录状态已经清除。你仍可以使用当前微信重新登录家庭点菜。
    </view>

    <view class="notice">
      退出登录不会删除你的饭局、菜谱、库存或历史记录。
    </view>

    <button class="login-button" :loading="loading" @tap="login">使用当前微信登录</button>
    <button class="exit-button" @tap="exit">退出小程序</button>
    <view v-if="errorText" class="error">{{ errorText }}</view>
  </view>
</template>

<script>
import { bootstrapAuth, exitMiniProgram } from '../../utils/auth.js';

export default {
  data() {
    return {
      loading: false,
      errorText: '',
    };
  },
  methods: {
    async login() {
      if (this.loading) return;
      this.loading = true;
      this.errorText = '';
      try {
        await bootstrapAuth({ force: true });
        uni.switchTab({ url: '/pages/today/today' });
      } catch (error) {
        if (error.code !== 'BIND_REQUIRED') {
          this.errorText = error.message || '登录失败，请稍后重试';
        }
      } finally {
        this.loading = false;
      }
    },
    exit() {
      exitMiniProgram();
    },
    goBack() {
      const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
      if (pages.length > 1) {
        uni.navigateBack();
        return;
      }
      exitMiniProgram();
    },
  },
};
</script>

<style>
.switch-page {
  min-height: 100vh;
  box-sizing: border-box;
  padding: 30rpx 48rpx 60rpx;
  background: linear-gradient(180deg, #FBF7F0 0%, #F1E7D8 100%);
  text-align: center;
}

.back-row {
  display: flex;
  justify-content: flex-start;
  margin-bottom: 28rpx;
}

.back-button {
  display: flex;
  align-items: center;
  gap: 6rpx;
  padding: 12rpx 22rpx;
  border: 1rpx solid rgba(91, 140, 90, 0.24);
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.72);
  color: #4F6F4D;
  font-size: 26rpx;
  line-height: 1;
}

.back-arrow {
  margin-top: -3rpx;
  font-size: 40rpx;
}

.logo {
  width: 220rpx;
  height: 220rpx;
  border-radius: 48rpx;
  box-shadow: 0 20rpx 44rpx rgba(65, 92, 62, 0.18);
}

.title {
  margin-top: 38rpx;
  color: #3B342E;
  font-size: 44rpx;
  font-weight: 700;
}

.subtitle {
  margin: 20rpx auto 36rpx;
  max-width: 620rpx;
  color: #7D746B;
  font-size: 27rpx;
  line-height: 1.7;
}

.notice {
  padding: 30rpx;
  background: #FFFFFF;
  border: 1rpx solid #EFE7DC;
  border-radius: 24rpx;
  color: #4B443E;
  font-size: 27rpx;
  line-height: 1.7;
}

.login-button {
  margin-top: 42rpx;
  border-radius: 20rpx;
  background: #5B8C5A;
  color: #FFFFFF;
  font-size: 30rpx;
}

.exit-button {
  margin-top: 20rpx;
  border: 1rpx solid #D9CBBE;
  border-radius: 20rpx;
  background: rgba(255, 255, 255, 0.65);
  color: #6D6259;
  font-size: 27rpx;
}

.error {
  margin-top: 24rpx;
  color: #C94F3D;
  font-size: 24rpx;
}
</style>
