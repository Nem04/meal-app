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
        <view class="muted">
          {{ m.meal_date }}
          <text v-if="m.photo_count"> · 有照片 {{ m.photo_count }} 张</text>
          <text v-if="m.sentence"> · “{{ m.sentence }}”</text>
        </view>
      </view>
      <view class="actions">
        <view class="small-btn" @tap.stop="openDetail(m)">详情</view>
        <view class="small-btn" @tap.stop="leaveLog(m)">留话</view>
        <view v-if="isChef" class="small-btn danger" @tap.stop="removeMeal(m)">删</view>
      </view>
    </view>

    <view v-if="detailVisible" class="detail-mask" @tap="closeDetail">
      <view class="detail-sheet" @tap.stop>
        <view class="detail-head">
          <view>
            <view class="detail-title">{{ detailMeal.title }}</view>
            <view class="muted">{{ detailMeal.meal_date }}</view>
          </view>
          <view class="detail-close" @tap="closeDetail">×</view>
        </view>
        <view v-if="detailMeal.log && detailMeal.log.sentence" class="detail-note">
          “{{ detailMeal.log.sentence }}”
        </view>
        <view class="section-title" style="margin:20rpx 0 8rpx;">吃过的菜（{{ detailDishes.length }}）</view>
        <scroll-view scroll-y class="detail-list">
          <view v-for="dish in detailDishes" :key="dish.id" class="dish-row">
            <view class="dish-main">
              <view style="font-weight:600">{{ dish.recipe_name }}</view>
              <view class="muted">
                {{ dish.submitter ? dish.submitter + ' 点的' : '已点' }}
                <text v-if="dish.quantity > 1"> · {{ dish.quantity }} 份</text>
              </view>
              <view v-if="dish.note" class="muted">备注：{{ dish.note }}</view>
            </view>
          </view>
          <view v-if="!detailDishes.length" class="muted detail-empty">这顿饭没有菜品记录</view>
        </scroll-view>
        <view v-if="detailPhotos.length" class="section-title" style="margin:20rpx 0 8rpx;">照片</view>
        <view v-if="detailPhotos.length" class="photo-grid">
          <image
            v-for="(photo, index) in detailPhotos"
            :key="photo.id"
            :src="photo.url"
            mode="aspectFill"
            class="photo-thumb"
            @tap="previewDetailPhoto(index)"
          />
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { request, toast, getMember } from '../../utils/index.js';
import { deleteMeal, getMealDetail } from '../../utils/meal-actions.js';
import { listMealPhotos } from '../../utils/photo-actions.js';

export default {
  data() {
    const now = new Date();
    return {
      year: now.getFullYear(), month: now.getMonth() + 1,
      days: [], cells: [], dows: ['日','一','二','三','四','五','六'], member: getMember(),
      detailVisible: false, detailMeal: {}, detailDishes: [], detailPhotos: [],
    };
  },
  computed: {
    isChef() { return this.member && this.member.role === 'chef'; },
  },
  onShow() { this.member = getMember(); this.load(); },
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
    async openDetail(meal) {
      try {
        const [detail, photos] = await Promise.all([
          getMealDetail(meal.id),
          listMealPhotos(meal.id),
        ]);
        this.detailMeal = detail;
        this.detailDishes = detail.items || [];
        this.detailPhotos = photos;
        this.detailVisible = true;
      } catch (error) {
        toast(error.message);
      }
    },
    closeDetail() {
      this.detailVisible = false;
      this.detailMeal = {};
      this.detailDishes = [];
      this.detailPhotos = [];
    },
    previewDetailPhoto(index) {
      uni.previewImage({
        urls: this.detailPhotos.map((photo) => photo.url),
        current: this.detailPhotos[index].url,
      });
    },
    leaveLog(meal) {
      uni.navigateTo({
        url: `/pages/log-edit/log-edit?mealId=${meal.id}`,
      });
    },
    removeMeal(meal) {
      uni.showModal({
        title: '删除这顿饭',
        content: `确定删除「${meal.title}」吗？点菜、备菜和日志记录会一起删除。`,
        confirmText: '删除',
        success: async (res) => {
          if (!res.confirm) return;
          try {
            await deleteMeal(meal.id);
            toast('已删除这顿饭');
            this.load();
          } catch (error) {
            toast(error.message);
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
.actions { display:flex; align-items:center; gap:10rpx; }
.small-btn { font-size:24rpx; padding:10rpx 22rpx; border-radius:999rpx; background:#F4EDE2; color:#3B342E; }
.small-btn.danger { background:#FBEAE5; color:#C94F3D; }
.detail-mask { position:fixed; top:0; right:0; bottom:0; left:0; background:rgba(40,35,30,.45); z-index:20; display:flex; align-items:flex-end; }
.detail-sheet { width:100%; max-height:75vh; box-sizing:border-box; background:#FFFDF8; border-radius:28rpx 28rpx 0 0; padding:28rpx 28rpx 40rpx; }
.detail-head { display:flex; align-items:flex-start; justify-content:space-between; gap:20rpx; }
.detail-title { font-size:34rpx; font-weight:700; }
.detail-close { font-size:46rpx; line-height:1; color:#8A8077; padding:0 8rpx; }
.detail-note { margin-top:14rpx; padding:16rpx 20rpx; background:#F4EDE2; border-radius:14rpx; color:#6F655B; }
.detail-list { max-height:52vh; }
.dish-row { padding:18rpx 0; border-bottom:1rpx dashed #EFE7DC; }
.dish-row:last-child { border-bottom:0; }
.detail-empty { text-align:center; padding:36rpx 0; }
.photo-grid { display:grid; grid-template-columns:repeat(3, 1fr); gap:10rpx; margin-bottom:20rpx; }
.photo-thumb { width:100%; height:180rpx; border-radius:14rpx; background:#EFE7DC; }
</style>
