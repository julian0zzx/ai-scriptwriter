/**
 * @ai-scriptwriter/scriptwriter-bundle — profile bundle for Duanju Studio.
 *
 * A bundle is not a plugin: it carries `dsh.bundle.patch`, so installing this
 * package into a profile appends it to `dsh.profile.bundles`. The patch inserts
 * the `@ai-scriptwriter/scriptwriter` row; that package is the plugin.
 *
 * @module @ai-scriptwriter/scriptwriter-bundle
 */
export const bundleName = '@ai-scriptwriter/scriptwriter-bundle'
export const pluginPackage = '@ai-scriptwriter/scriptwriter'
export const pluginRowId = 'ai-scriptwriter'
