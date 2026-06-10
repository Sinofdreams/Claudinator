export function buildClaudeArgs(_name: string, resumeSessionId?: string | null, model?: string): string {
  const parts = ['claude']
  if (model) {
    parts.push('--model', `'${model.replace(/'/g, "''")}'`)
  }
  if (resumeSessionId) {
    parts.push('--resume', `'${resumeSessionId.replace(/'/g, "''")}'`)
  }
  return parts.join(' ')
}
