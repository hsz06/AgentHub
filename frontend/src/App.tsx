import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import ChatPage from './pages/ChatPage'

function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#087f8c',
          colorInfo: '#087f8c',
          colorSuccess: '#2f855a',
          colorWarning: '#c27a1a',
          colorError: '#c5484d',
          colorText: '#202b2f',
          colorBgContainer: '#fffdf8',
          borderRadius: 8,
          fontFamily: '"IBM Plex Sans", "Noto Sans SC", sans-serif',
        },
        components: {
          Button: { controlHeight: 34, fontWeight: 600 },
          Drawer: { colorBgElevated: '#fffdf8' },
          Tabs: { itemSelectedColor: '#087f8c', inkBarColor: '#087f8c' },
        },
      }}
    >
      <Router>
        <Routes>
          <Route path="/" element={<Navigate to="/chat" replace />} />
          <Route path="/chat" element={<ChatPage />} />
        </Routes>
      </Router>
    </ConfigProvider>
  )
}

export default App
