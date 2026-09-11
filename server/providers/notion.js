/**
 * Notion Database task provider for Bot Crossing Task Board.
 */
export default {
  id: 'notion',
  name: 'Notion',
  description: 'Sync tasks and project tickets directly from a Notion Database.',
  fields: [
    {
      key: 'apiKey',
      label: 'Notion Internal Integration Secret',
      type: 'password',
      placeholder: 'secret_...',
      required: true,
    },
    {
      key: 'databaseId',
      label: 'Notion Database ID',
      type: 'text',
      placeholder: '32-character database UUID from page URL',
      required: true,
    },
    {
      key: 'statusProperty',
      label: 'Status Property Name',
      type: 'text',
      placeholder: 'Status (default)',
      required: false,
    },
    {
      key: 'assigneeProperty',
      label: 'Assignee Property Name',
      type: 'text',
      placeholder: 'Assignee or Owner (default)',
      required: false,
    },
  ],

  async test(config = {}) {
    const apiKey = config.apiKey || process.env.NOTION_API_KEY || process.env.NOTION_TOKEN || ''
    const databaseId = config.databaseId || process.env.NOTION_DATABASE_ID || ''
    if (!apiKey || !databaseId) {
      return { ok: false, error: 'API Secret and Database ID are required' }
    }
    const cleanId = databaseId.replace(/-/g, '')
    try {
      const res = await fetch(`https://api.notion.com/v1/databases/${cleanId}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Notion-Version': '2022-06-28',
        },
      })
      if (res.ok) {
        const data = await res.json()
        const title = data.title?.[0]?.plain_text || 'Untitled Database'
        return { ok: true, name: title }
      }
      return { ok: false, error: `Notion returned ${res.status}: ${res.statusText}` }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  },

  async fetchTasks(config = {}) {
    const apiKey = config.apiKey || process.env.NOTION_API_KEY || process.env.NOTION_TOKEN || ''
    const databaseId = config.databaseId || process.env.NOTION_DATABASE_ID || ''
    if (!apiKey || !databaseId) return []
    const cleanId = databaseId.replace(/-/g, '')
    const statusProp = config.statusProperty || 'Status'
    const assigneeProp = config.assigneeProperty || 'Assignee'

    try {
      const res = await fetch(`https://api.notion.com/v1/databases/${cleanId}/query`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ page_size: 50 }),
      })

      if (!res.ok) return []
      const data = await res.json()
      const pages = data.results || []

      return pages.map((page) => {
        // Extract title
        let title = 'Untitled Task'
        for (const val of Object.values(page.properties || {})) {
          if (val.type === 'title' && val.title?.[0]?.plain_text) {
            title = val.title.map((t) => t.plain_text).join('')
            break
          }
        }

        // Extract status
        const statusVal = page.properties?.[statusProp]
        let statusName = statusVal?.status?.name || statusVal?.select?.name || 'Pending'
        let status = 'pending'
        const lowerStatus = statusName.toLowerCase()
        if (lowerStatus.includes('progress') || lowerStatus.includes('doing') || lowerStatus.includes('working')) {
          status = 'in_progress'
        } else if (lowerStatus.includes('done') || lowerStatus.includes('completed')) {
          status = 'done'
        } else if (lowerStatus.includes('block')) {
          status = 'blocked'
        }

        // Extract assignee
        const assigneeVal = page.properties?.[assigneeProp]
        let assignee = 'Unassigned'
        if (assigneeVal?.people?.[0]?.name) {
          assignee = assigneeVal.people.map((p) => p.name).join(', ')
        } else if (assigneeVal?.select?.name) {
          assignee = assigneeVal.select.name
        }

        return {
          id: `notion:${page.id}`,
          title,
          preview: `Notion task (${statusName})`,
          project: 'Notion',
          assignee,
          status,
          priority: 'normal',
          url: page.url,
          source: 'notion',
          sourceName: 'Notion',
          updatedAt: Date.parse(page.last_edited_time) || Date.now(),
        }
      })
    } catch {
      return []
    }
  },
}
