import prisma from './src/utils/prisma'

async function main() {
  console.log('Verifying database contents...\n')

  const agents = await prisma.agent.findMany()
  console.log(`Found ${agents.length} Agents:`)
  agents.forEach(a => {
    console.log(`  - ID: ${a.id}`)
    console.log(`    Name: ${a.name}`)
    console.log(`    Adapter: ${a.adapterType}`)
    console.log(`    Capabilities: ${a.capabilities}`)
    console.log(`    Builtin: ${a.isBuiltin}`)
    console.log()
  })

  console.log('\n✅ Database verification completed successfully!')
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect())
