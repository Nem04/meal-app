<template>
  <view>
    <view class="cal-head">
      <view class="nav" @tap="nav(-1)">‹ 上月</view>
      <view style="font-weight:700">{{ year }} 年 {{ month }} 月</view>
      <view class="nav" @tap="nav(1)">下月 ›</view>
    </view>
    <view class="cal-grid">
      <view v-for="w in dows" :key="w" class="cal-dow">{{ w }}</view>
      <view v-for="c in cells" :key="c.key" :class="['cal-cell', c.other ? 'other' : '', c.today ? 'today' : '', c.hasMeal ? 'has' : '']" @tap="c.hasMeal && openDay(c.ds)">
        <view class="d">{{ c.day }}</view>
        <view v-if="c.hasMeal" class="dot"></view>
      </view>
    </view>
    <view class="section-title">这个月吃过的（{{ days.length }} 顿）</view>
    <view v-for="m in days" :key="m.id" class="card row">
      <view class="emoji">🍽</view>
      <view style="flex:1">
        <view style="font-weight:600">{{ m.title }}</view>
        <view class="muted">{{ m.meal_date }}{{ m.sentence ? ' · “' + m.sentence + '”' : '' }}</view>
      </view>
      <view class="small-btn" @tap.stop="leaveLog(m)">留话</view>
    </view>
  </view>
</template>

<script>
import { request, toast } from '../../utils/index.js';

export default {
  data() {
    const now = new Date();
    return {
      year: now.getFullYear(), month: now.getMonth() + 1,
      days: [], cells: [], dows: ['日','一','二','三','四','五','六'],
    };
  },
  onShow() { this.load(); },
  methods: {
    async load() {
      try {
        const res = await request(`/calendar?year=${this.year}&month=${this.month}`);
        this.days = res.days || [];
        this.buildCalendar(res.year, res.month);
      } catch (e) { toast(e.message); }
    },
    buildCalendar(year, month) {
      const first = new Date(year, month - 1, 1);
      const dow = first.getDay();
      const n = new Date(year, month, 0).getDate();
      const todayStr = this.today();
      const by = {};
      this.days.forEach((d) => { by[d.meal_date] = d; });
      const cells = [];
      for (let i = 0; i < dow; i++) cells.push({ key: 'x' + i, other: true, day: '' });
      for (let d = 1; d <= n; d++) {
        const ds = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        cells.push({ key: ds, day: d, ds, hasMeal: !!by[ds], today: ds === todayStr });
      }
      this.cells = cells;
    },
    today() {
      const x = new Date();
      return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    },
    nav(delta) {
      let m = this.month + delta, y = this.year;
      if (m < 1) { m = 12; y--; }
      if (m > 12) { m = 1; y++; }
      this.year = y; this.month = m;
      this.load();
    },
    openDay(ds) { toast(ds); },
    leaveLog(m) {
      uni.showModal({
        title: '吃完留一句话', editable: true, placeholderText: '今天这顿怎么样？',
        success: async (res) => {
          if (res.confirm) {
            try {
              await request(`/meals/${m.id}/log`, 'POST', { sentence: res.content || '', rating: '' });
              toast('记下啦 ✅');
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
.cal-head { display:flex; justify-content:space-between; align-items:center; padding:20rpx 24rpx; }
.nav { background:#fff; border:1rpx solid #EFE7DC; border-radius:16rpx; padding:10rpx 20rpx; font-size:24rpx; }
.cal-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:6rpx; padding:0 24rpx; }
.cal-dow { text-align:center; font-size:22rpx; color:#8A8077; padding:8rpx 0; }
.cal-cell { background:#fff; border:1rpx solid #EFE7DC; border-radius:12rpx; min-height:100rpx; padding:8rpx; position:relative; }
.cal-cell.other { opacity:.35; }
.cal-cell.today { border:4rpx solid #5B8C5A; }
.cal-cell .d { font-size:22rpx; color:#8A8077; }
.cal-cell .dot { position:absolute; bottom:8rpx; left:50%; transform:translateX(-50%); width:14rpx; height:14rpx; border-radius:50%; background:#D96A3B; }
.row { display:flex; align-items:center; gap:20rpx; }
.small-btn { font-size:24rpx; padding:10rpx 22rpx; border-radius:999rpx; background:#F4EDE2; color:#3B342E; }
</style>
