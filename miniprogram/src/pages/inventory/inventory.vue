<template>
  <view>
    <view class="btn-primary" @tap="bulkForm">📋 整段粘贴录入</view>
    <view class="section-title">库存清单（{{ list.length }} 项）</view>
    <view v-for="i in list" :key="i.id" class="card row">
      <view class="emoji">🥫</view>
      <view style="flex:1">
        <view style="font-weight:600">{{ i.canonical_name }}</view>
        <view class="muted">{{ i.quantity }} {{ i.unit }}{{ i.note ? ' · ' + i.note : '' }}</view>
      </view>
      <view v-if="isChef" class="small-btn" @tap.stop="editStock(i)">改</view>
      <view v-if="isChef" class="small-btn danger" @tap.stop="delStock(i)">删</view>
    </view>
    <view v-if="!list.length" class="muted" style="text-align:center;margin:40rpx;">库存空空的，先粘贴录入吧</view>
  </view>
</template>

<script>
import { request, toast, getMember } from '../../utils/index.js';

export default {
  data() { return { list: [], member: null }; },
  computed: { isChef() { return this.member && this.member.role === 'chef'; } },
  onShow() { this.member = getMember(); this.load(); },
  methods: {
    async load() { try { this.list = await request('/inventory'); } catch (e) { toast(e.message); } },
    bulkForm() {
      uni.showModal({
        title: '整段粘贴录入', editable: true, placeholderText: '芹菜一斤，酱油一瓶、鸡蛋十个',
        success: async (res) => {
          if (res.confirm && res.content) {
            try {
              const r = await request('/inventory/bulk', 'POST', { text: res.content, operator: '主厨' });
              toast(`已入库 ${r.saved.length} 条 ✅`);
              this.load();
            } catch (e) { toast(e.message); }
          }
        },
      });
    },
    editStock(i) {
      uni.showModal({
        title: '改库存 · ' + i.canonical_name, editable: true, placeholderText: '新数量',
        success: async (res) => {
          if (res.confirm && res.content !== '' && res.content !== undefined) {
            try {
              await request(`/inventory/${i.id}`, 'PATCH', { op: 'stocktake', quantity: Number(res.content) });
              toast('库存已更新 ✅');
              this.load();
            } catch (e) { toast(e.message); }
          }
        },
      });
    },
    delStock(i) {
      uni.showModal({
        title: '删除库存', content: `确定删除「${i.canonical_name}」吗？删除后不可恢复。`,
        success: async (res) => {
          if (res.confirm) {
            try {
              await request(`/inventory/${i.id}`, 'DELETE', {});
              toast('库存已删除 🗑');
              this.load();
            } catch (e) { toast(e.message); }
          }
        },
      });
    },
  },
};
</script>

<style>
.row { display:flex; align-items:center; gap:20rpx; }
.small-btn { font-size:24rpx; padding:8rpx 20rpx; border-radius:999rpx; background:#F4EDE2; color:#3B342E; }
.small-btn.danger { background:#FBEAE5; color:#C94F3D; }
</style>
