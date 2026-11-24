<template>
  <view class="entry-page">
    <image class="logo" src="/static/brand/app-avatar-144.png" mode="aspectFill"></image>
    <view class="title">家庭点菜</view>
    <view class="status">正在进入家庭点菜…</view>
  </view>
</template>

<script>
import { hasExplicitSignOut } from '../../utils/auth.js';

export default {
  onLoad() {
    if (hasExplicitSignOut()) {
      uni.reLaunch({ url: '/pages/switch-wechat/switch-wechat' });
      return;
    }
    uni.switchTab({ url: '/pages/today/today' });
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

</style>
