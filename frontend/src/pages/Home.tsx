import { Card, Typography, Space } from 'antd'

const { Title, Paragraph } = Typography

const Home = () => {
  return (
    <Card>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Title level={2}>AgentHub - 多Agent协作平台</Title>
        <Paragraph>
          项目已成功初始化！技术栈包含：
        </Paragraph>
        <ul>
          <li>React 18 + TypeScript</li>
          <li>Vite 构建工具（端口 5173）</li>
          <li>Ant Design 5 组件库</li>
          <li>React Router 路由管理</li>
          <li>Zustand 状态管理</li>
          <li>React Markdown 渲染</li>
          <li>React Syntax Highlighter 代码高亮</li>
        </ul>
      </Space>
    </Card>
  )
}

export default Home
