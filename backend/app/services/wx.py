"""微信小程序登录：code2session 取 openid。

huawei2 在国内，可直连 api.weixin.qq.com，无需代理。
开发期未配 WX_APPID 时，支持 mock：code 以 'mock-' 开头则直接把其后缀当作 openid，
方便开发者工具/curl 联调（生产配了真 appid/secret 后走真实接口）。
"""

import json
import urllib.parse
import urllib.request

from fastapi import HTTPException

from ..settings import settings

API = "https://api.weixin.qq.com/sns/jscode2session"


def code2session(code: str) -> str:
    """用 js_code 换 openid。失败抛 HTTPException。"""
    if not code:
        raise HTTPException(422, "缺少 code")
    # 开发联调 mock：code = 'mock-<openid>'
    if code.startswith("mock-"):
        return code[len("mock-"):] or "mock-openid"
    if not (settings.wx_appid and settings.wx_secret):
        raise HTTPException(503, "服务端未配置微信 AppID/Secret")

    qs = urllib.parse.urlencode({
        "appid": settings.wx_appid,
        "secret": settings.wx_secret,
        "js_code": code,
        "grant_type": "authorization_code",
    })
    try:
        with urllib.request.urlopen(f"{API}?{qs}", timeout=10) as resp:
            data = json.loads(resp.read().decode())
    except Exception as e:
        raise HTTPException(502, f"微信登录服务不可用: {e}")
    if data.get("errcode"):
        raise HTTPException(401, f"微信登录失败: {data.get('errmsg', data['errcode'])}")
    openid = data.get("openid")
    if not openid:
        raise HTTPException(401, "微信未返回 openid")
    return openid
