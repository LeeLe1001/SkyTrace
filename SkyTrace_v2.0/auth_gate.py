"""
SkyTrace v2.0 — 安全认证门控模块
用于在未认证时仅返回最小登录页面，不暴露业务 DOM
"""
import os

_SECURE_LOGIN_HTML_CACHE: str | None = None


def get_secure_login_html() -> str:
    """返回安全的纯登录页面 HTML（不含任何业务内容）"""
    global _SECURE_LOGIN_HTML_CACHE
    if _SECURE_LOGIN_HTML_CACHE:
        return _SECURE_LOGIN_HTML_CACHE

    _SECURE_LOGIN_HTML_CACHE = r'''<!DOCTYPE html>
<html lang="zh-CN" style="background:#0a0a0f">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
    <title>SkyTrace — 登录</title>
    <meta name="theme-color" content="#0a0a0f">
    <link rel="icon" href="favicon.ico">
    <style>
        :root {
            --bg: #0a0a0f;
            --card-bg: #111827;
            --text: #e2e8f0;
            --sub: #64748b;
            --primary: #3b82f6;
            --border: #1e293b;
            --input-bg: #1a1f2e;
            --danger: #ef4444;
            --radius: 12px;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
            background: var(--bg);
            color: var(--text);
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100dvh;
            padding: 20px;
        }
        .login-card {
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            padding: 32px 28px;
            width: 100%;
            max-width: 380px;
        }
        .brand {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 28px;
        }
        .brand-logo {
            font-size: 36px;
            line-height: 1;
        }
        .brand-title {
            font-size: 22px;
            font-weight: 700;
            letter-spacing: 1px;
        }
        .brand-sub {
            font-size: 12px;
            color: var(--sub);
        }
        h2 {
            font-size: 18px;
            margin-bottom: 8px;
        }
        .hint {
            font-size: 12px;
            color: var(--sub);
            margin-bottom: 20px;
            line-height: 1.5;
        }
        .field {
            margin-bottom: 14px;
        }
        .field label {
            display: block;
            font-size: 13px;
            color: var(--sub);
            margin-bottom: 4px;
        }
        .field input {
            width: 100%;
            padding: 10px 12px;
            border: 1px solid var(--border);
            border-radius: 8px;
            background: var(--input-bg);
            color: var(--text);
            font-size: 15px;
            outline: none;
            transition: border-color 0.2s;
        }
        .field input:focus {
            border-color: var(--primary);
        }
        .btn {
            width: 100%;
            padding: 11px;
            background: var(--primary);
            color: #fff;
            border: none;
            border-radius: 8px;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
            transition: opacity 0.2s;
        }
        .btn:hover { opacity: 0.9; }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .error {
            color: var(--danger);
            font-size: 12px;
            margin-top: 10px;
            min-height: 18px;
        }
        .footer {
            text-align: center;
            margin-top: 24px;
            font-size: 11px;
            color: var(--sub);
        }
    </style>
</head>
<body>
    <div class="login-card" id="login-card">
        <div class="brand">
            <div class="brand-logo">&#9992;&#65039;</div>
            <div>
                <div class="brand-title">SkyTrace</div>
                <div class="brand-sub">Secure multi-user flight hub</div>
            </div>
        </div>
        <div id="panel-login">
            <h2>登录</h2>
            <p class="hint">登录后将自动加载你的专属行程、设置和 API 配置。</p>
            <div class="field">
                <label>用户名</label>
                <input type="text" id="username" autocomplete="username" placeholder="admin">
            </div>
            <div class="field">
                <label>密码</label>
                <input type="password" id="password" autocomplete="current-password" placeholder="Password">
            </div>
            <button class="btn" id="btn-login" onclick="doLogin()">登录</button>
            <div class="error" id="error-msg"></div>
        </div>
        <div id="panel-setup" style="display:none">
            <h2>创建管理员账号</h2>
            <p class="hint">首次使用需要先创建管理员账号，系统会自动接管你当前的本地航班数据。</p>
            <div class="field">
                <label>显示名称</label>
                <input type="text" id="setup-display" autocomplete="name" placeholder="SkyTrace Admin">
            </div>
            <div class="field">
                <label>用户名</label>
                <input type="text" id="setup-username" autocomplete="username" placeholder="admin">
            </div>
            <div class="field">
                <label>密码</label>
                <input type="password" id="setup-password" autocomplete="new-password" placeholder="At least 6 characters">
            </div>
            <button class="btn" id="btn-setup" onclick="doSetup()">创建管理员</button>
            <div class="error" id="setup-error"></div>
        </div>
        <div class="footer">SkyTrace v2.0 &middot; 安全航旅管理</div>
    </div>

    <script>
    var _busy = false;

    async function checkState() {
        try {
            var r = await fetch('/api/auth/state');
            var s = await r.json();
            if (s.needs_setup) {
                document.getElementById('panel-login').style.display = 'none';
                document.getElementById('panel-setup').style.display = '';
            }
            if (s.authenticated) {
                window.location.reload();
            }
        } catch(e) {}
    }

    async function doLogin() {
        if (_busy) return;
        var u = document.getElementById('username').value.trim();
        var p = document.getElementById('password').value;
        if (!u || !p) return showError('请输入用户名和密码');

        _busy = true;
        var btn = document.getElementById('btn-login');
        btn.disabled = true;
        btn.textContent = '登录中...';

        try {
            var r = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({username: u, password: p})
            });
            var d = await r.json();
            if (d.success) {
                window.location.reload();
            } else {
                showError(d.error || '登录失败');
            }
        } catch(e) {
            showError('网络错误，请稍后重试');
        } finally {
            _busy = false;
            btn.disabled = false;
            btn.textContent = '登录';
        }
    }

    async function doSetup() {
        if (_busy) return;
        var u = document.getElementById('setup-username').value.trim();
        var p = document.getElementById('setup-password').value;
        var dn = document.getElementById('setup-display').value.trim();
        if (!u || !p) {
            document.getElementById('setup-error').textContent = '请填写用户名和密码';
            return;
        }

        _busy = true;
        var btn = document.getElementById('btn-setup');
        btn.disabled = true;
        btn.textContent = '创建中...';

        try {
            var r = await fetch('/api/setup', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({username: u, password: p, display_name: dn})
            });
            var d = await r.json();
            if (d.success) {
                window.location.reload();
            } else {
                document.getElementById('setup-error').textContent = d.error || '创建失败';
            }
        } catch(e) {
            document.getElementById('setup-error').textContent = '网络错误，请稍后重试';
        } finally {
            _busy = false;
            btn.disabled = false;
            btn.textContent = '创建管理员';
        }
    }

    function showError(msg) {
        document.getElementById('error-msg').textContent = msg;
    }

    // 回车键提交
    document.getElementById('password').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') doLogin();
    });

    checkState();
    </script>
</body>
</html>'''
    return _SECURE_LOGIN_HTML_CACHE
