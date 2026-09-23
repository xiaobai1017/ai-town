/**
 * 小镇天气系统模型与变换调度
 * @author hubin
 */

export type WeatherType = 'SUNNY' | 'CLOUDY' | 'RAINY' | 'STORMY' | 'SNOWY';

export interface WeatherMeta {
  type: WeatherType;
  nameZh: string;
  nameEn: string;
  emoji: string;
  descriptionZh: string;
  descriptionEn: string;
  /** 适宜户外活动程度 0.0 ~ 1.0 */
  outdoorAffinity: number;
}

export const WEATHER_CONFIGS: Record<WeatherType, WeatherMeta> = {
  SUNNY: {
    type: 'SUNNY',
    nameZh: '晴朗',
    nameEn: 'Sunny',
    emoji: '☀️',
    descriptionZh: '阳光明媚，微风和煦，适宜户外漫步与公园活动',
    descriptionEn: 'Bright and sunny, pleasant breeze, perfect for walking in the park',
    outdoorAffinity: 1.0
  },
  CLOUDY: {
    type: 'CLOUDY',
    nameZh: '多云',
    nameEn: 'Cloudy',
    emoji: '⛅',
    descriptionZh: '云层遮蔽，气候适宜，各处生活节奏舒适平稳',
    descriptionEn: 'Cloudy with mild climate, steady and comfortable living pace',
    outdoorAffinity: 0.8
  },
  RAINY: {
    type: 'RAINY',
    nameZh: '小雨',
    nameEn: 'Rainy',
    emoji: '🌧️',
    descriptionZh: '细雨霏霏，地面微湿，出行宜备雨伞，更倾向室内活动',
    descriptionEn: 'Gentle rainfall, moist ground, best with an umbrella, prefer indoor visits',
    outdoorAffinity: 0.3
  },
  STORMY: {
    type: 'STORMY',
    nameZh: '雷阵雨',
    nameEn: 'Stormy',
    emoji: '⛈️',
    descriptionZh: '电闪雷鸣，风雨交加，宜尽快就近避雨或居家安歇',
    descriptionEn: 'Thunder and heavy rain, seek shelter nearby or rest at home',
    outdoorAffinity: 0.0
  },
  SNOWY: {
    type: 'SNOWY',
    nameZh: '小雪',
    nameEn: 'Snowy',
    emoji: '❄️',
    descriptionZh: '雪花纷飞，气温寒冷，宜添衣保暖或到面包店享用暖饮',
    descriptionEn: 'Snow fluttering, chilly weather, dress warmly or enjoy hot drinks at the bakery',
    outdoorAffinity: 0.2
  }
};

export const ALL_WEATHERS: WeatherType[] = ['SUNNY', 'CLOUDY', 'RAINY', 'STORMY', 'SNOWY'];

/**
 * 加权随机抽取下一次天气，且优先避免与当前天气连续重复
 * 晴天 35%, 多云 30%, 小雨 20%, 雷阵雨 10%, 雪天 5%
 */
export function getRandomNextWeather(current?: WeatherType): WeatherType {
  const weights: Record<WeatherType, number> = {
    SUNNY: 35,
    CLOUDY: 30,
    RAINY: 20,
    STORMY: 10,
    SNOWY: 5
  };

  const pool: WeatherType[] = [];
  for (const w of ALL_WEATHERS) {
    if (w === current) continue; // 避免连续相同
    const weight = weights[w];
    for (let i = 0; i < weight; i++) {
      pool.push(w);
    }
  }

  if (pool.length === 0) return 'SUNNY';
  const selected = pool[Math.floor(Math.random() * pool.length)];
  return selected;
}

/**
 * 判断当前时间是否应触发天气变换
 * @param gameTimeMinutes 游戏时间分钟数
 * @param lastChangeTime 上次变换的游戏时间分钟数
 * @param intervalHours 变换周期（小时），默认 4
 */
export function shouldChangeWeather(
  gameTimeMinutes: number,
  lastChangeTime: number,
  intervalHours: number = 4
): boolean {
  const intervalMinutes = Math.max(1, intervalHours) * 60;
  return (gameTimeMinutes - lastChangeTime) >= intervalMinutes;
}
