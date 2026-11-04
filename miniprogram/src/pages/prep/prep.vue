<template>
  <view>
    <view class="summary card">
      <view class="sum-item"><text class="num">{{ prepared }}/{{ total }}</text><text class="muted">已备齐</text></view>
      <view class="sum-item"><text class="num green">{{ total - missing }}</text><text class="muted">库存够</text></view>
      <view class="sum-item"><text class="num red">{{ missing }}</text><text class="muted">还缺</text></view>
    </view>
    <view class="muted" style="margin:0 24rpx 8rpx;">勾选只表示「备齐了」，不会扣库存。</view>
    <view v-for="e in entries" :key="e.id" class="card row">
      <view class="emoji">🧺</view>
      <view style="flex:1">
        <view style="font-weight:600">{{ e.canonical_name }}
          <text :class="e.shortage > 0 ? 'badge red' : 'badge green'">{{ e.shortage > 0 ? '缺' : '够' }}</text>
        </view>
        <view class="muted">需 {{ e.total_quantity }} {{ e.unit }} · 库存 {{ e.available === null ? '无' : e.available + ' ' + e.unit }}<text v-if="e.shortage > 0" style="color:#C94F3D"> · 缺 {{ e.shortage }}</text></view>
      </view>
      <view v-if="isChef" :class="e.prepared ? 'toggle on' : 'toggle'" @tap="toggle(e)"></view>
    </view>
  </view>
</template>

<script>
import { request, toast, getMember } from '../../utils/index.js';

export default {
  data() {
    return { mealId: '', prep: { total: 0, prepared: 0, missing: 0, entries: [] }, member: null };
  },
  computed: {
    total() { return this.prep.total || 0; },
    prepared() { return this.prep.prepared || 0; },
    missing() { return this.prep.missing || 0; },
    entries() { return this.prep.entries || []; },
    isChef() { return this.member && this.member.role === 'chef'; },
  },
  onLoad(options) { this.mealId = options.mealId || ''; },
  onShow() { this.member = getMember(); this.load(); },
  methods: {
    async load() {
      try { this.prep = await request(`/meals/${this.mealId}/prep`); } catch (e) { toast(e.message); }
    },
    async toggle(e) {
      try {
        await request(`/meals/${this.mealId}/prep/${e.id}`, 'PATCH', { prepared: !e.prepared });
        this.load();
      } catch (err) { toast(err.message); }
    },
  },
};
</script>

<style>
.summary { display:flex; }
.summary .sum-item { flex:1; text-align:center; }
.sum-item .num { display:block; font-size:40rpx; font-weight:700; }
.sum-item .green { color:#5B8C5A; }
.sum-item .red { color:#C94F3D; }
.row { display:flex; align-items:center; gap:20rpx; }
.badge { font-size:20rpx; padding:2rpx 12rpx; border-radius:999rpx; margin-left:12rpx; }
.badge.red { background:#FBEAE5; color:#C94F3D; }
.badge.green { background:#EAF2E7; color:#4F7A4E; }
.toggle { width:84rpx; height:48rpx; border-radius:999rpx; background:#E5DCCD; position:relative; }
.toggle::after { content:''; position:absolute; width:40rpx; height:40rpx; border-radius:50%; background:#fff; top:4rpx; left:4rpx; transition:left .18s; }
.toggle.on { background:#5B8C5A; }
.toggle.on::after { left:40rpx; }
</style>
