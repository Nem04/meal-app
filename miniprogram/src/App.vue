<script>
import { bootstrapAuth } from './utils/auth.js';

export default {
  onLaunch: function () {
    setTimeout(() => {
      bootstrapAuth().catch((error) => {
        if (error.code !== 'BIND_REQUIRED') {
          console.error('微信登录初始化失败', error);
        }
      });
    }, 0);
  },
}
</script>

<style>
/* 每个页面公共样式：手写菜单风 */
page {
  background-color: #FAF6F0;
  color: #3B342E;
  font-size: 28rpx;
  line-height: 1.6;
}

.card {
  background: #FFFFFF;
  border: 1rpx solid #EFE7DC;
  border-radius: 24rpx;
  padding: 28rpx;
  margin: 20rpx 24rpx;
  box-shadow: 0 4rpx 16rpx rgba(60, 44, 32, 0.05);
}

.btn-primary {
  background: #5B8C5A;
  color: #FFFFFF;
  border-radius: 20rpx;
  padding: 24rpx;
  font-size: 30rpx;
  font-weight: 600;
  text-align: center;
  margin: 16rpx 24rpx;
}

.btn-danger {
  background: #C94F3D;
}

.btn-primary::after { border: none; }

.muted {
  color: #8A8077;
  font-size: 24rpx;
}

.section-title {
  font-size: 30rpx;
  font-weight: 600;
  margin: 24rpx 24rpx 8rpx;
}

.emoji {
  width: 80rpx;
  height: 80rpx;
  background: #F4EDE2;
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 44rpx;
}
</style>
