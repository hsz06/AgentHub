import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  const gptAgent = await prisma.agent.upsert({
    where: { id: 'agent-gpt-builtin' },
    update: {},
    create: {
      id: 'agent-gpt-builtin',
      name: 'GPT Assistant',
      avatar: '🤖',
      description: 'OpenAI GPT 系列智能助手，擅长自然语言理解、代码生成和通用问答',
      capabilities: JSON.stringify(['对话', '代码生成', '写作', '推理', '多轮对话']),
      systemPrompt: '你是一个有帮助的AI助手，由OpenAI提供技术支持。',
      adapterType: 'openai',
      isBuiltin: true,
    },
  })

  const claudeAgent = await prisma.agent.upsert({
    where: { id: 'agent-claude-builtin' },
    update: {},
    create: {
      id: 'agent-claude-builtin',
      name: 'Claude Assistant',
      avatar: '🧠',
      description: 'Anthropic Claude 智能助手，拥有超长上下文窗口，擅长长文本处理和分析',
      capabilities: JSON.stringify(['长文本分析', '文档处理', '代码审查', '逻辑推理', '创意写作']),
      systemPrompt: '你是Claude，一个由Anthropic开发的有用、无害、诚实的AI助手。',
      adapterType: 'claude',
      isBuiltin: true,
    },
  })

  console.log('Seeded agents:', { gptAgent, claudeAgent })
  console.log('Seed completed successfully!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
