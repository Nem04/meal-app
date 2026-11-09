<template>
  <view>
    <view class="section-title">这顿吃啥 · 留句话</view>
    <view class="card">
      <textarea
        v-model="sentence"
        class="sentence-input"
        placeholder="这顿怎么样？"
        :maxlength="-1"
      />
    </view>

    <view class="section-title">照片（{{ existingPhotos.length + localPhotos.length }}/3）</view>
    <view class="card">
      <view class="photo-grid">
        <view v-for="(photo, index) in existingPhotos" :key="photo.id" class="photo-cell">
          <image
            :src="photo.url"
            mode="aspectFill"
            class="photo-thumb"
            @tap="previewExisting(index)"
          />
          <view class="photo-delete" @tap.stop="removeExisting(photo)">×</view>
        </view>
        <view v-for="(photo, index) in localPhotos" :key="'local-' + index" class="photo-cell">
          <image
            :src="photo.path"
            mode="aspectFill"
            class="photo-thumb"
            @tap="previewLocal(index)"
          />
          <view class="photo-delete" @tap.stop="removeLocal(index)">×</view>
        </view>
      </view>
      <view v-if="!existingPhotos.length && !localPhotos.length" class="muted photo-empty">
        还没有照片，选一张记录这顿饭吧
      </view>
      <view class="photo-actions">
        <view class="pick-btn" @tap="pickFromAlbum">从相册选择</view>
        <view class="pick-btn" @tap="takePhoto">拍照</view>
      </view>
    </view>

    <view class="btn-primary save-btn" :class="{ disabled: saving }" @tap="save">
      {{ saving ? '保存中…' : '保存' }}
    </view>
  </view>
</template>

<script>
import { request, toast } from '../../utils/index.js';
import { getMealDetail } from '../../utils/meal-actions.js';
import {
  listMealPhotos,
  uploadMealPhoto,
  deleteMealPhoto,
  remainingPhotoSlots,
  mimeTypeFromPath,
  photoPickerOptions,
  compressImage,
  getFileSize,
  readFileBase64,
} from '../../utils/photo-actions.js';

export default {
  data() {
    return {
      mealId: '',
      meal: {},
      sentence: '',
      existingPhotos: [],
      localPhotos: [],
      saving: false,
    };
  },
  onLoad(options) {
    this.mealId = options.mealId || '';
  },
  onShow() {
    this.load();
  },
  methods: {
    async load() {
      try {
        const [meal, photos] = await Promise.all([
          getMealDetail(this.mealId),
          listMealPhotos(this.mealId),
        ]);
        this.meal = meal;
        this.sentence = meal.log?.sentence || '';
        this.existingPhotos = photos;
      } catch (error) {
        toast(error.message);
      }
    },
    pickFromAlbum() {
      this.choosePhotos('album');
    },
    takePhoto() {
      this.choosePhotos('camera');
    },
    choosePhotos(sourceType) {
      const count = remainingPhotoSlots(this.existingPhotos.length, this.localPhotos.length);
      if (count <= 0) return toast('每顿饭最多 3 张照片');
      uni.chooseImage({
        ...photoPickerOptions(sourceType, count),
        success: (result) => {
          const files = (result.tempFiles || []).map((file) => ({
            path: file.path,
            size: file.size,
            mimeType: mimeTypeFromPath(file.path),
          }));
          this.preparePhotos(files);
        },
      });
    },
    async preparePhotos(files) {
      for (const file of files) {
        try {
          let path = file.path;
          let size = file.size;
          if (size > 2 * 1024 * 1024) {
            path = await compressImage(path);
            size = await getFileSize(path);
          }
          if (size > 2 * 1024 * 1024) {
            toast(`「${path.split('/').pop()}」压缩后仍超过 2 MB`);
            continue;
          }
          this.localPhotos.push({ path, size, mimeType: mimeTypeFromPath(path) });
        } catch (error) {
          toast(error.message || '图片处理失败');
        }
      }
    },
    removeLocal(index) {
      this.localPhotos.splice(index, 1);
    },
    async removeExisting(photo) {
      try {
        await deleteMealPhoto(this.mealId, photo.id);
        this.existingPhotos = this.existingPhotos.filter((item) => item.id !== photo.id);
      } catch (error) {
        toast(error.message);
      }
    },
    previewExisting(index) {
      uni.previewImage({
        urls: this.existingPhotos.map((photo) => photo.url),
        current: this.existingPhotos[index].url,
      });
    },
    previewLocal(index) {
      uni.previewImage({
        urls: this.localPhotos.map((photo) => photo.path),
        current: this.localPhotos[index].path,
      });
    },
    async save() {
      this.saving = true;
      try {
        await request(`/meals/${this.mealId}/log`, 'POST', {
          sentence: this.sentence || '',
          rating: '',
        });
        while (this.localPhotos.length) {
          const file = this.localPhotos[0];
          const data = await readFileBase64(file.path);
          const saved = await uploadMealPhoto(this.mealId, {
            mimeType: file.mimeType,
            data,
          });
          this.existingPhotos.push(saved);
          this.localPhotos.shift();
        }
        toast('留话已保存');
        setTimeout(() => uni.navigateBack(), 400);
      } catch (error) {
        toast(error.message);
      } finally {
        this.saving = false;
      }
    },
  },
};
</script>

<style>
.sentence-input {
  width: 100%;
  min-height: 160rpx;
  box-sizing: border-box;
  background: #FDFBF7;
  border: 1rpx solid #EFE7DC;
  border-radius: 16rpx;
  padding: 20rpx;
  font-size: 28rpx;
  line-height: 1.6;
}
.photo-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10rpx;
}
.photo-cell {
  position: relative;
}
.photo-thumb {
  width: 100%;
  height: 180rpx;
  border-radius: 14rpx;
  background: #EFE7DC;
}
.photo-delete {
  position: absolute;
  top: -12rpx;
  right: -12rpx;
  width: 44rpx;
  height: 44rpx;
  border-radius: 50%;
  background: #C94F3D;
  color: #FFFFFF;
  font-size: 30rpx;
  line-height: 44rpx;
  text-align: center;
}
.photo-empty {
  text-align: center;
  padding: 20rpx 0;
}
.photo-actions {
  display: flex;
  gap: 16rpx;
  margin-top: 20rpx;
}
.pick-btn {
  flex: 1;
  text-align: center;
  padding: 18rpx 0;
  border-radius: 16rpx;
  background: #F4EDE2;
  color: #3B342E;
  font-size: 26rpx;
}
.save-btn {
  margin-top: 24rpx;
}
.save-btn.disabled {
  opacity: 0.5;
}
</style>
