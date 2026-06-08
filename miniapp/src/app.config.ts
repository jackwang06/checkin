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
    color: '#787774',
    selectedColor: '#2383e2',
    backgroundColor: '#ffffff',
    borderStyle: 'white',
    list: [
      { pagePath: 'pages/me/index', text: '我的考勤' },
      { pagePath: 'pages/leave/list', text: '假条' },
      { pagePath: 'pages/profile/index', text: '我的' },
    ],
  },
})
