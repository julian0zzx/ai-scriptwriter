import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { bundleName, pluginPackage, pluginRowId } from './index.js'

assert.equal(bundleName, '@ai-scriptwriter/scriptwriter-bundle')
assert.equal(pluginPackage, '@ai-scriptwriter/scriptwriter')
assert.equal(pluginRowId, 'ai-scriptwriter')

const patch = await readFile(new URL('./cordis.patch.yml', import.meta.url), 'utf8')
assert.match(patch, /id: ai-scriptwriter/)
assert.match(patch, /name: '@ai-scriptwriter\/scriptwriter'/)
console.log('bundle ok')
