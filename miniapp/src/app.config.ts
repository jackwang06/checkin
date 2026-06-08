export default defineAppConfig({
  pages: [
    'pages/me/index',
    'pages/leave/list',
    'pages/profile/index',
    'pages/login/index',
    'pages/leave/new',
    'pages/admin/rollcall',
    'pages/admin/leaves',
    'pages/admin/stats',
    'pages/admin/student',
    'pages/change-password/index',
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTitleText: '晚点名',
    navigationBarTextStyle: 'black',
  },
  tabBar: {
    // 自定义 tabBar：按角色显隐「点名」（学生 3 栏 / 管理员 4 栏），见 src/custom-tab-bar
    custom: true,
    color: '#787774',
    selectedColor: '#2383e2',
    backgroundColor: '#ffffff',
    borderStyle: 'white',
    list: [
      { pagePath: 'pages/me/index', text: '我的考勤',
        iconPath: 'assets/tabbar/attendance.png', selectedIconPath: 'assets/tabbar/attendance-active.png' },
      { pagePath: 'pages/leave/list', text: '假条',
        iconPath: 'assets/tabbar/leave.png', selectedIconPath: 'assets/tabbar/leave-active.png' },
      { pagePath: 'pages/admin/rollcall', text: '点名',
        iconPath: 'assets/tabbar/rollcall.png', selectedIconPath: 'assets/tabbar/rollcall-active.png' },
      { pagePath: 'pages/profile/index', text: '我的',
        iconPath: 'assets/tabbar/me.png', selectedIconPath: 'assets/tabbar/me-active.png' },
    ],
  },
})
