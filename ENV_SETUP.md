# 环境变量配置清单
# 在 Vercel Dashboard → 项目 → Settings → Environment Variables 中添加以下内容

## 1. DeepSeek API（八字深度解读）
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxx
# 获取方式：https://platform.deepseek.com → API Keys → 创建新密钥

## 2. Lemon Squeezy（支付收款）
LS_API_KEY=eyJxxxxxxxxxxxxxxxxxxxxxxxxxxxx
LS_STORE_ID=12345
LS_READING_VARIANT=67890
LS_WALLPAPER_VARIANT=67891
LS_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxx
# 获取方式：
# - LS_API_KEY:    Lemon Squeezy 后台 → Settings → API → 创建 API Key
# - LS_STORE_ID:   Settings → Stores → 你的店铺ID（URL中可见）
# - LS_*_VARIANT:  Products → 创建两个产品（完整解读$3.99 / 壁纸$1.99）→ 各自 Variant ID
# - LS_WEBHOOK_SECRET: Settings → Webhooks → 创建Webhook → 复制Signing Secret
#                  Webhook URL 填: https://你的域名.com/api/webhook
#                  事件勾选: order_created

## 3. 自定义令牌签名密钥（必须是随机字符串，不能用示例值）
TOKEN_SECRET=请用以下命令生成一个随机密钥替换此处

# 生成方法（在本地电脑终端运行，Mac/Linux）：
# openssl rand -hex 32
#
# Windows PowerShell：
# -join ((48..57)+(97..102)|Get-Random -Count 64|%{[char]$_})

## 4. 站点URL
SITE_URL=https://getbazioracle.com

---

## 配置完成后的检查清单

- [ ] DeepSeek API Key 已添加且账户有余额（充值$5即可测试上千次）
- [ ] Lemon Squeezy 店铺已创建，完成实名认证（用于提现）
- [ ] 已创建「完整解读」产品，定价 $3.99，记录 Variant ID
- [ ] 已创建「壁纸」产品，定价 $1.99，记录 Variant ID
- [ ] Webhook 已配置，URL指向 /api/webhook，事件选 order_created
- [ ] TOKEN_SECRET 已用随机生成的值替换（不能用文档里的示例文字）
- [ ] 所有环境变量添加后，在 Vercel 点击 "Redeploy" 重新部署一次

## 测试流程（上线前必做）

1. 用 Lemon Squeezy 测试模式下单（后台可开启 Test Mode）
2. 完成支付后检查是否正确跳转回网站并显示解锁内容
3. 检查 Vercel 函数日志（Vercel Dashboard → 项目 → Logs）确认 webhook 收到并验签成功
4. 确认 DeepSeek 返回的解读内容正常显示
5. 测试壁纸下载功能，确认下载的图片包含正确的命盘信息
6. 关闭 Test Mode，切换正式收款
