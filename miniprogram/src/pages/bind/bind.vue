<template>
  <view class="bind-page">
    <view class="bind-title">加入这个家</view>
    <view class="bind-subtitle">
      第一次进入需要绑定微信身份，之后会自动登录。同一个主厨码可由多个微信使用，使用主厨码进入都会获得主厨权限。
    </view>
    <view class="kind-row">
      <view :class="['kind', kind === 'chef' ? 'on' : '']" @tap="kind = 'chef'">主厨</view>
      <view :class="['kind', kind === 'member' ? 'on' : '']" @tap="kind = 'member'">家人</view>
    </view>
    <input v-model="displayName" class="input" maxlength="20" placeholder="显示名，例如：爸爸" />
    <input v-model="inviteCode" class="input" password placeholder="首次绑定口令" />
    <view class="tip">
      主厨码和家人码都可以供多个微信使用；请只发给家庭成员。
    </view>
    <button class="primary" :loading="loading" @tap="submit">绑定并进入</button>
  </view>
</template>

<script>
import { bindWechatMember } from '../../utils/auth.js';
import { toast } from '../../utils/index.js';

export default {
  data() {
    return { kind: 'member', displayName: '', inviteCode: '', loading: false };
  },
  methods: {
    async submit() {
      const name = this.displayName.trim();
      if (!name) return toast('先填写显示名');
      if (!this.inviteCode) return toast('先填写绑定口令');
      this.loading = true;
      try {
        await bindWechatMember({
          kind: this.kind === 'chef' ? 'chef' : 'family',
          inviteCode: this.inviteCode,
          displayName: name,
        });
        toast('绑定成功');
        uni.switchTab({ url: '/pages/today/today' });
      } catch (error) {
        if (error.code === 'OPENID_ALREADY_BOUND') {
          uni.switchTab({ url: '/pages/today/today' });
          return;
        }
        toast(error.message);
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style>
.bind-page { padding: 48rpx 36rpx; }
.bind-title { font-size: 52rpx; font-weight: 700; }
.bind-subtitle { margin-top: 16rpx; color: #8A8077; font-size: 26rpx; }
.kind-row { display: flex; gap: 20rpx; margin: 48rpx 0 28rpx; }
.kind { flex: 1; text-align: center; padding: 24rpx; border: 1rpx solid #EFE7DC; border-radius: 20rpx; background: #FFFFFF; }
.kind.on { color: #4F7A4E; border-color: #5B8C5A; background: #EAF2E7; font-weight: 600; }
.input { display: block; width: 100%; padding: 26rpx 28rpx; margin-bottom: 20rpx; border-radius: 18rpx; background: #FFFFFF; }
.tip { color: #8A8077; font-size: 24rpx; margin: 8rpx 0 30rpx; }
.primary { width: 100%; background: #5B8C5A; color: #FFFFFF; border-radius: 20rpx; }
</style>
