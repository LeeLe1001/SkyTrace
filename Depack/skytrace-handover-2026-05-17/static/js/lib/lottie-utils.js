/**
 * LottieUtils - 雷达动画管理
 */
const LottieUtils = {
    _playerEl: null,

    init() {
        if (!customElements.get('lottie-player')) {
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/@lottiefiles/lottie-player@2.0.8/dist/lottie-player.js';
            document.head.appendChild(script);
        }
        this._ensurePlayer();
    },

    _ensurePlayer() {
        if (this._playerEl) return;
        this._playerEl = document.createElement('lottie-player');
        this._playerEl.id = 'radar-player';
        this._playerEl.setAttribute('background', 'transparent');
        this._playerEl.setAttribute('speed', '1');
        this._playerEl.setAttribute('loop', '');
        this._playerEl.style.cssText = 'display:none;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:120px;height:120px;z-index:1001;pointer-events:none;';
        document.body.appendChild(this._playerEl);
        this.updateTheme();
    },

    show() {
        this._ensurePlayer();
        this.updateTheme();
        this._playerEl.style.display = 'block';
    },

    hide() {
        if (this._playerEl) this._playerEl.style.display = 'none';
    },

    scanOnce() {
        this._ensurePlayer();
        this.updateTheme();
        this._playerEl.style.display = 'block';
        this._playerEl.setAttribute('loop', 'false');
        const handler = () => {
            this._playerEl.style.display = 'none';
            this._playerEl.setAttribute('loop', '');
            this._playerEl.removeEventListener('complete', handler);
        };
        this._playerEl.addEventListener('complete', handler);
    },

    updateTheme() {
        if (!this._playerEl) return;
        const isDark = uiStore.get('theme') === 'dark';
        this._playerEl.setAttribute('src',
            isDark ? '/static/animations/radar-dark.json'
                   : '/static/animations/radar-light.json'
        );
    },
};
