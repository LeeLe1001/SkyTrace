/**
 * SoundManager - 通知音效管理
 * 映射 Flighty 三档音效到 Web Audio API
 */
class SoundManager {
    constructor() {
        this._sounds = {};
        this._enabled = true;
        this._volume = 0.5;
        this._preloaded = false;
    }

    /** 预加载所有音效 */
    preload() {
        const files = {
            good: '/static/sounds/good.wav',
            nonUrgent: '/static/sounds/non-urgent.wav',
            bad: '/static/sounds/bad.wav',
        };
        for (const [name, url] of Object.entries(files)) {
            const audio = new Audio(url);
            audio.preload = 'auto';
            this._sounds[name] = audio;
        }
        this._preloaded = true;
    }

    /** 播放音效 */
    play(name) {
        if (!this._enabled) return;
        const audio = this._sounds[name];
        if (!audio) return;
        audio.volume = this._volume;
        audio.currentTime = 0;
        audio.play().catch(() => {});  // 忽略自动播放限制
    }

    /** 根据航班状态播放对应音效 */
    notifyFlightStatus(status) {
        const map = {
            'on_time': 'good', 'landed': 'good',
            'checkin_open': 'nonUrgent', 'boarding': 'nonUrgent',
            'delayed': 'bad', 'canceled': 'bad', 'diverted': 'bad',
        };
        const sound = map[status];
        if (sound) this.play(sound);
    }

    set enabled(val) { this._enabled = val; settingsStore.set('soundEnabled', val); }
    get enabled() { return this._enabled; }

    set volume(val) { this._volume = Math.max(0, Math.min(1, val)); settingsStore.set('soundVolume', this._volume); }
    get volume() { return this._volume; }
}

const soundManager = new SoundManager();
